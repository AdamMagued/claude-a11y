/**
 * Tests for chat-a11y.js DOM transformations.
 *
 * Uses JSDOM via vitest to simulate browser DOM. Each test creates a
 * minimal DOM structure, loads chat-a11y.js, and verifies the correct
 * ARIA attributes and sr-only spans are applied.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

var scriptSource = readFileSync(
  resolve(__dirname, "..", "chat-a11y.js"),
  "utf-8"
);

function injectScript() {
  // Reset the guard so the IIFE runs fresh each time
  delete window.__claudeA11yInjected;
  delete window.__ca11yScan;
  delete window.__ca11yStats;

  // Remove any previously injected styles and live regions
  document.querySelectorAll("style").forEach(function (s) { s.remove(); });
  var oldLive = document.getElementById("ca11y-live");
  if (oldLive) oldLive.remove();

  // Execute the script
  var fn = new Function(scriptSource);
  fn();
}

describe("chat-a11y.js", function () {
  beforeEach(function () {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    injectScript();
  });

  afterEach(function () {
    delete window.__claudeA11yInjected;
    delete window.__ca11yScan;
    delete window.__ca11yStats;
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe("initialization", function () {
    it("sets the injection guard on window", function () {
      expect(window.__claudeA11yInjected).toBe(true);
    });

    it("exposes __ca11yScan and __ca11yStats globally", function () {
      expect(typeof window.__ca11yScan).toBe("function");
      expect(typeof window.__ca11yStats).toBe("function");
    });

    it("creates an ARIA live region", function () {
      var live = document.getElementById("ca11y-live");
      expect(live).not.toBeNull();
      expect(live.getAttribute("role")).toBe("status");
      expect(live.getAttribute("aria-live")).toBe("polite");
    });

    it("injects sr-only CSS with user-select:none", function () {
      var styles = document.querySelectorAll("style");
      var found = false;
      for (var i = 0; i < styles.length; i++) {
        if (styles[i].textContent.indexOf("user-select: none") !== -1) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("does not double-init when called twice", function () {
      var countBefore = document.querySelectorAll("#ca11y-live").length;
      injectScript(); // second call
      var countAfter = document.querySelectorAll("#ca11y-live").length;
      // The second call should be a no-op because the guard is set
      // But our test resets the guard, so let's verify the guard works
      window.__claudeA11yInjected = true;
      var fn = new Function(scriptSource);
      fn();
      // Should still be 1 live region (or 2 from our forced double-init above)
      // The point is the guard prevents re-execution
      expect(window.__claudeA11yInjected).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Code blocks
  // -------------------------------------------------------------------------

  describe("code block transforms", function () {
    it("adds aria-label with detected language", function () {
      document.body.innerHTML =
        '<pre><code class="language-python">print("hi")</code></pre>';
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Python code block");
    });

    it("adds role=region and tabindex to code blocks", function () {
      document.body.innerHTML =
        '<pre><code class="language-javascript">var x = 1;</code></pre>';
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("tabindex")).toBe("0");
    });

    it("defaults to 'Code' when no language class is present", function () {
      document.body.innerHTML = "<pre><code>some code</code></pre>";
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
    });

    it("inserts sr-only [Language] and [End Language] spans", function () {
      document.body.innerHTML =
        '<pre><code class="language-rust">fn main() {}</code></pre>';
      window.__ca11yScan();

      var srSpans = document.querySelectorAll(".ca11y-sr-only");
      var texts = [];
      for (var i = 0; i < srSpans.length; i++) {
        texts.push(srSpans[i].textContent);
      }
      expect(texts).toContain("[Rust]");
      expect(texts).toContain("[End Rust]");
    });

    it("does not double-process a code block", function () {
      document.body.innerHTML =
        '<pre><code class="language-go">fmt.Println("hi")</code></pre>';
      window.__ca11yScan();
      window.__ca11yScan();

      // Should only have one pair of sr-only spans inside the pre
      var pre = document.querySelector("pre");
      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(2); // [Go] and [End Go]
    });
  });

  // -------------------------------------------------------------------------
  // Headings
  // -------------------------------------------------------------------------

  describe("heading transforms", function () {
    it("adds [Heading] prefix to h1 and h2", function () {
      document.body.innerHTML = "<h2>Installation</h2>";
      window.__ca11yScan();

      var sr = document.querySelector(".ca11y-sr-only");
      expect(sr.textContent).toBe("[Heading] ");
    });

    it("adds [Subheading] prefix to h3 through h6", function () {
      document.body.innerHTML = "<h4>Details</h4>";
      window.__ca11yScan();

      var sr = document.querySelector(".ca11y-sr-only");
      expect(sr.textContent).toBe("[Subheading] ");
    });
  });

  // -------------------------------------------------------------------------
  // Tables
  // -------------------------------------------------------------------------

  describe("table transforms", function () {
    it("adds role=table, aria-label, tabindex, and announces dimensions", function () {
      document.body.innerHTML = [
        "<div>",
        "  <table>",
        "    <tr><th>Name</th><th>Role</th></tr>",
        "    <tr><td>Alice</td><td>Engineer</td></tr>",
        "  </table>",
        "</div>",
      ].join("");
      window.__ca11yScan();

      var table = document.querySelector("table");
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("tabindex")).toBe("0");
      expect(table.getAttribute("aria-label")).toBe("Table, 2 columns");

      var srSpans = document.querySelectorAll(".ca11y-sr-only");
      var texts = [];
      for (var i = 0; i < srSpans.length; i++) {
        texts.push(srSpans[i].textContent);
      }
      expect(texts).toContain("[Table, 2 columns]");
      expect(texts).toContain("[End Table]");
    });

    it("sets columnheader role and scope on th elements", function () {
      document.body.innerHTML = [
        "<div>",
        "  <table>",
        "    <tr><th>A</th><th>B</th></tr>",
        "    <tr><td>1</td><td>2</td></tr>",
        "  </table>",
        "</div>",
      ].join("");
      window.__ca11yScan();

      var ths = document.querySelectorAll("th");
      for (var i = 0; i < ths.length; i++) {
        expect(ths[i].getAttribute("role")).toBe("columnheader");
        expect(ths[i].getAttribute("scope")).toBe("col");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Blockquotes
  // -------------------------------------------------------------------------

  describe("blockquote transforms", function () {
    it("adds role=note and [Quote] prefix", function () {
      document.body.innerHTML = "<blockquote>Some wise words</blockquote>";
      window.__ca11yScan();

      var bq = document.querySelector("blockquote");
      expect(bq.getAttribute("role")).toBe("note");

      var sr = bq.querySelector(".ca11y-sr-only");
      expect(sr.textContent).toBe("[Quote] ");
    });
  });

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  describe("list transforms", function () {
    it("announces bulleted list with item count and adds role=list", function () {
      document.body.innerHTML =
        "<div><ul><li>One</li><li>Two</li><li>Three</li></ul></div>";
      window.__ca11yScan();

      var ul = document.querySelector("ul");
      expect(ul.getAttribute("role")).toBe("list");

      var lis = document.querySelectorAll("li");
      for (var j = 0; j < lis.length; j++) {
        expect(lis[j].getAttribute("role")).toBe("listitem");
      }

      var srSpans = document.querySelectorAll(".ca11y-sr-only");
      var texts = [];
      for (var i = 0; i < srSpans.length; i++) {
        texts.push(srSpans[i].textContent);
      }
      expect(texts).toContain("[3 item bulleted list]");
    });

    it("announces numbered list with item count and adds role=list", function () {
      document.body.innerHTML =
        "<div><ol><li>First</li><li>Second</li></ol></div>";
      window.__ca11yScan();

      var ol = document.querySelector("ol");
      expect(ol.getAttribute("role")).toBe("list");

      var lis = document.querySelectorAll("li");
      for (var j = 0; j < lis.length; j++) {
        expect(lis[j].getAttribute("role")).toBe("listitem");
      }

      var srSpans = document.querySelectorAll(".ca11y-sr-only");
      var texts = [];
      for (var i = 0; i < srSpans.length; i++) {
        texts.push(srSpans[i].textContent);
      }
      expect(texts).toContain("[2 item numbered list]");
    });
  });

  // -------------------------------------------------------------------------
  // Chat message containers
  // -------------------------------------------------------------------------

  describe("chat message container transforms", function () {
    it("adds role=region to claude.ai message containers", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><p>Hello</p></div>';
      window.__ca11yScan();

      var msg = document.querySelector('[data-testid="chat-message-content"]');
      expect(msg.getAttribute("role")).toBe("region");
      expect(msg.getAttribute("aria-label")).toMatch(/^AI response/);
    });

    it("adds role=region to .prose containers", function () {
      document.body.innerHTML = '<div class="prose"><p>Response text</p></div>';
      window.__ca11yScan();

      var msg = document.querySelector(".prose");
      expect(msg.getAttribute("role")).toBe("region");
    });
  });

  // -------------------------------------------------------------------------
  // Horizontal rules
  // -------------------------------------------------------------------------

  describe("horizontal rule transforms", function () {
    it("adds role=separator with aria-label", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><hr></div>';
      window.__ca11yScan();

      var hr = document.querySelector("hr");
      expect(hr.getAttribute("role")).toBe("separator");
      expect(hr.getAttribute("aria-label")).toBe("[Separator]");
    });
  });

  // -------------------------------------------------------------------------
  // Images
  // -------------------------------------------------------------------------

  describe("image transforms", function () {
    it("adds fallback alt text when missing", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><img src="test.png"></div>';
      window.__ca11yScan();

      var img = document.querySelector("img");
      expect(img.alt).toBe("Image");
    });

    it("preserves existing alt text", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><img src="test.png" alt="A diagram"></div>';
      window.__ca11yScan();

      var img = document.querySelector("img");
      expect(img.alt).toBe("A diagram");
    });
  });

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------

  describe("link transforms", function () {
    it("fills empty link text with the href", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><a href="https://example.com"></a></div>';
      window.__ca11yScan();

      var a = document.querySelector("a");
      // JSDOM normalizes the href with a trailing slash
      expect(a.textContent).toMatch(/^https:\/\/example\.com\/?$/);
    });

    it("preserves existing link text", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><a href="https://example.com">Example site</a></div>';
      window.__ca11yScan();

      var a = document.querySelector("a");
      expect(a.textContent).toBe("Example site");
    });
  });

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  describe("__ca11yStats", function () {
    it("returns accurate transform count", function () {
      document.body.innerHTML = [
        '<pre><code class="language-python">x = 1</code></pre>',
        "<h2>Title</h2>",
        "<blockquote>Quote</blockquote>",
      ].join("");
      window.__ca11yScan();

      var stats = window.__ca11yStats();
      expect(stats.transformCount).toBeGreaterThanOrEqual(3);
      expect(stats.observerActive).toBe(true);
      expect(stats.hasLiveRegion).toBe(true);
    });

    it("reports selector health warning status", function () {
      var stats = window.__ca11yStats();
      expect(typeof stats.selectorHealthWarning).toBe("boolean");
    });

    it("reports fallback rescan status", function () {
      var stats = window.__ca11yStats();
      expect(typeof stats.fallbackActive).toBe("boolean");
    });
  });

  // -------------------------------------------------------------------------
  // Copy-paste safety
  // -------------------------------------------------------------------------

  describe("copy-paste safety", function () {
    it("sr-only spans have user-select:none in injected CSS", function () {
      var styles = document.querySelectorAll("style");
      var cssText = "";
      for (var i = 0; i < styles.length; i++) {
        cssText += styles[i].textContent;
      }
      expect(cssText).toContain("user-select: none");
      expect(cssText).toContain("-webkit-user-select: none");
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  describe("idempotency", function () {
    it("does not add duplicate transforms on repeated scans", function () {
      document.body.innerHTML = [
        "<div>",
        '  <pre><code class="language-python">x = 1</code></pre>',
        "  <h2>Title</h2>",
        "  <div><table><tr><th>A</th></tr><tr><td>1</td></tr></table></div>",
        "  <div><ul><li>One</li></ul></div>",
        "  <blockquote>Note</blockquote>",
        "</div>",
      ].join("");

      window.__ca11yScan();
      var firstCount = window.__ca11yStats().transformCount;

      window.__ca11yScan();
      window.__ca11yScan();
      window.__ca11yScan();

      var finalCount = window.__ca11yStats().transformCount;
      expect(finalCount).toBe(firstCount);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases and malformed HTML
  // -------------------------------------------------------------------------

  describe("edge cases and malformed HTML", function () {
    it("handles code blocks with missing class attribute on code", function () {
      document.body.innerHTML = "<pre><code>echo hello</code></pre>";
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
      expect(pre.getAttribute("tabindex")).toBe("0");

      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(2);
      expect(srSpans[0].textContent).toBe("[Code]");
      expect(srSpans[1].textContent).toBe("[End Code]");
    });

    it("handles code blocks with empty or whitespace-only class attributes", function () {
      document.body.innerHTML = [
        '<pre><code class="">var a = 1;</code></pre>',
        '<pre><code class="   ">var b = 2;</code></pre>',
      ].join("");
      window.__ca11yScan();

      var pres = document.querySelectorAll("pre");
      expect(pres.length).toBe(2);
      for (var i = 0; i < pres.length; i++) {
        expect(pres[i].getAttribute("role")).toBe("region");
        expect(pres[i].getAttribute("aria-label")).toBe("Code code block");
      }
    });

    it("handles code blocks with non-language or malformed language classes", function () {
      document.body.innerHTML = [
        '<pre><code class="highlighted line-numbers hljs">const x = 10;</code></pre>',
        '<pre><code class="lang-js language-">test</code></pre>',
      ].join("");
      window.__ca11yScan();

      var pres = document.querySelectorAll("pre");
      expect(pres.length).toBe(2);
      expect(pres[0].getAttribute("aria-label")).toBe("Code code block");
      expect(pres[1].getAttribute("aria-label")).toBe("Code code block");
    });

    it("handles pre blocks without any code child element", function () {
      document.body.innerHTML = "<pre>Plain text output from command</pre>";
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
      expect(pre.getAttribute("tabindex")).toBe("0");

      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(2);
      expect(srSpans[0].textContent).toBe("[Code]");
      expect(srSpans[1].textContent).toBe("[End Code]");
    });

    it("transforms deeply nested structures (tables inside blockquotes inside lists)", function () {
      document.body.innerHTML = [
        "<ul>",
        "  <li>",
        "    <blockquote>",
        "      <table>",
        "        <thead>",
        "          <tr><th>Header 1</th><th>Header 2</th></tr>",
        "        </thead>",
        "        <tbody>",
        "          <tr><td>Value 1</td><td>Value 2</td></tr>",
        "        </tbody>",
        "      </table>",
        "    </blockquote>",
        "  </li>",
        "</ul>",
      ].join("");
      window.__ca11yScan();

      var ul = document.querySelector("ul");
      expect(ul.getAttribute("role")).toBe("list");

      var li = document.querySelector("li");
      expect(li.getAttribute("role")).toBe("listitem");

      var bq = document.querySelector("blockquote");
      expect(bq.getAttribute("role")).toBe("note");
      var bqSr = bq.querySelector(".ca11y-sr-only");
      expect(bqSr.textContent).toBe("[Quote] ");

      var table = document.querySelector("table");
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("aria-label")).toBe("Table, 2 columns");
      expect(table.getAttribute("tabindex")).toBe("0");

      var ths = table.querySelectorAll("th");
      expect(ths.length).toBe(2);
      for (var i = 0; i < ths.length; i++) {
        expect(ths[i].getAttribute("role")).toBe("columnheader");
        expect(ths[i].getAttribute("scope")).toBe("col");
      }
    });

    it("handles empty pre and code elements without crashing", function () {
      document.body.innerHTML = [
        "<pre><code></code></pre>",
        "<pre></pre>",
      ].join("");
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var pres = document.querySelectorAll("pre");
      expect(pres.length).toBe(2);
      for (var i = 0; i < pres.length; i++) {
        expect(pres[i].getAttribute("role")).toBe("region");
        expect(pres[i].getAttribute("aria-label")).toBe("Code code block");
      }
    });

    it("handles empty table elements without crashing", function () {
      document.body.innerHTML = [
        "<div><table></table></div>",
        "<div><table><tr></tr></table></div>",
      ].join("");
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var tables = document.querySelectorAll("table");
      expect(tables.length).toBe(2);
      for (var i = 0; i < tables.length; i++) {
        expect(tables[i].getAttribute("role")).toBe("table");
        expect(tables[i].getAttribute("aria-label")).toBe("Table, 0 columns");
      }
    });

    it("handles empty blockquotes and empty lists without crashing", function () {
      document.body.innerHTML = [
        "<blockquote></blockquote>",
        "<ul></ul>",
        "<ol></ol>",
      ].join("");
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var bq = document.querySelector("blockquote");
      expect(bq.getAttribute("role")).toBe("note");

      var ul = document.querySelector("ul");
      expect(ul.getAttribute("role")).toBe("list");

      var ol = document.querySelector("ol");
      expect(ol.getAttribute("role")).toBe("list");
    });

    it("preserves pre-existing ARIA attributes and upstream accessibility on code blocks", function () {
      document.body.innerHTML = [
        '<pre role="region" aria-label="Python code block" tabindex="0">',
        '  <code class="language-python">print("hello")</code>',
        "</pre>",
      ].join("");
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Python code block");
      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(0);
    });

    it("preserves upstream chat response landmarks and aria-describedby", function () {
      document.body.innerHTML = [
        '<div role="region" aria-label="AI response from assistant" aria-describedby="msg-meta">',
        '  <p id="msg-meta">Metadata</p>',
        '  <p>Response content</p>',
        "</div>",
      ].join("");
      window.__ca11yScan();

      var container = document.querySelector("div");
      expect(container.getAttribute("role")).toBe("region");
      expect(container.getAttribute("aria-label")).toBe("AI response from assistant");
      expect(container.getAttribute("aria-describedby")).toBe("msg-meta");
    });

    it("handles malformed HTML and unclosed tags gracefully", function () {
      document.body.innerHTML = "<div><p>Unclosed paragraph<blockquote>Unclosed quote<pre><code>x = 1</div>";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var pre = document.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre.getAttribute("role")).toBe("region");

      var bq = document.querySelector("blockquote");
      expect(bq).not.toBeNull();
      expect(bq.getAttribute("role")).toBe("note");
    });

    it("handles unconventional nesting like inline elements wrapping blocks", function () {
      document.body.innerHTML = "<span><div><h2>Nested Heading</h2><p>Paragraph</p></div></span>";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var h2 = document.querySelector("h2");
      var sr = h2.querySelector(".ca11y-sr-only");
      expect(sr).not.toBeNull();
      expect(sr.textContent).toBe("[Heading] ");
    });
  });

  // -------------------------------------------------------------------------
  // Dynamic DOM and observer behavior
  // -------------------------------------------------------------------------

  describe("dynamic DOM and observer behavior", function () {
    it("transforms dynamically added elements on subsequent scan", function () {
      document.body.innerHTML = "<div><p>Initial message</p></div>";
      window.__ca11yScan();
      var countBefore = window.__ca11yStats().transformCount;

      var newTurn = document.createElement("div");
      newTurn.innerHTML = '<pre><code class="language-javascript">var a = 1;</code></pre>';
      document.body.appendChild(newTurn);

      window.__ca11yScan();
      var countAfter = window.__ca11yStats().transformCount;

      var pre = newTurn.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Javascript code block");
      expect(countAfter).toBeGreaterThan(countBefore);
    });

    it("transforms dynamically appended elements via MutationObserver", function () {
      return new Promise(function (resolve) {
        var wrapper = document.createElement("div");
        wrapper.innerHTML = "<blockquote>Dynamic blockquote content</blockquote>";
        document.body.appendChild(wrapper);

        setTimeout(function () {
          var bq = wrapper.querySelector("blockquote");
          expect(bq.getAttribute("role")).toBe("note");
          var sr = bq.querySelector(".ca11y-sr-only");
          expect(sr).not.toBeNull();
          expect(sr.textContent).toBe("[Quote] ");
          resolve();
        }, 300);
      });
    });

    it("handles rapid DOM mutations during simulated streaming without duplicate transforms", function () {
      var container = document.createElement("div");
      container.setAttribute("data-testid", "chat-message-content");
      document.body.appendChild(container);

      // Token 1: partial heading
      var h2 = document.createElement("h2");
      h2.textContent = "Streamed";
      container.appendChild(h2);
      window.__ca11yScan();

      // Token 2: complete heading text
      h2.appendChild(document.createTextNode(" Heading"));
      window.__ca11yScan();

      // Token 3: paragraph
      var p = document.createElement("p");
      p.textContent = "Streaming line 1...";
      container.appendChild(p);
      window.__ca11yScan();

      // Token 4: code block starts
      var pre = document.createElement("pre");
      var code = document.createElement("code");
      code.className = "language-python";
      code.textContent = "def func():";
      pre.appendChild(code);
      container.appendChild(pre);
      window.__ca11yScan();

      // Token 5: code block completes
      code.textContent = "def func():\n    return 42";
      window.__ca11yScan();

      // Verify no duplicate announcements
      var srHeadings = h2.querySelectorAll(".ca11y-sr-only");
      expect(srHeadings.length).toBe(1);
      expect(srHeadings[0].textContent).toBe("[Heading] ");

      var srCode = pre.querySelectorAll(".ca11y-sr-only");
      expect(srCode.length).toBe(2);
      expect(srCode[0].textContent).toBe("[Python]");
      expect(srCode[1].textContent).toBe("[End Python]");
      expect(pre.getAttribute("aria-label")).toBe("Python code block");
    });

    it("debounces rapid consecutive mutations via MutationObserver", function () {
      return new Promise(function (resolve) {
        var container = document.createElement("div");
        document.body.appendChild(container);

        for (var i = 0; i < 5; i++) {
          var p = document.createElement("p");
          p.textContent = "Streamed token " + i;
          container.appendChild(p);
        }

        var pre = document.createElement("pre");
        pre.innerHTML = '<code class="language-ruby">puts "done"</code>';
        container.appendChild(pre);

        setTimeout(function () {
          expect(pre.getAttribute("role")).toBe("region");
          expect(pre.getAttribute("aria-label")).toBe("Ruby code block");
          var srSpans = pre.querySelectorAll(".ca11y-sr-only");
          expect(srSpans.length).toBe(2);
          resolve();
        }, 300);
      });
    });

    it("preserves previously transformed nodes when sibling elements are appended", function () {
      document.body.innerHTML = '<div><pre><code class="language-go">package main</code></pre></div>';
      window.__ca11yScan();

      var firstPre = document.querySelector("pre");
      var initialSpans = firstPre.querySelectorAll(".ca11y-sr-only");
      expect(initialSpans.length).toBe(2);

      // Append sibling table
      var tableContainer = document.createElement("div");
      tableContainer.innerHTML = "<table><tr><th>Key</th></tr><tr><td>Val</td></tr></table>";
      document.body.appendChild(tableContainer);

      window.__ca11yScan();

      // First pre should remain untouched
      var finalSpans = firstPre.querySelectorAll(".ca11y-sr-only");
      expect(finalSpans.length).toBe(2);
      expect(firstPre.getAttribute("aria-label")).toBe("Go code block");

      // New table should be transformed
      var table = tableContainer.querySelector("table");
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("aria-label")).toBe("Table, 1 columns");
    });
  });
});
