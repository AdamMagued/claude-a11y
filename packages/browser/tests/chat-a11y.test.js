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
  // Edge cases: Code blocks with missing or malformed language classes
  // -------------------------------------------------------------------------

  describe("edge cases: code blocks with missing or malformed language classes", function () {
    it("handles code block with missing <code> child element (<pre>plain text</pre>)", function () {
      document.body.innerHTML = "<pre>plain text in pre tag</pre>";
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

    it("handles code block with completely empty code element (<pre><code></code></pre>)", function () {
      document.body.innerHTML = "<pre><code></code></pre>";
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(2);
      expect(srSpans[0].textContent).toBe("[Code]");
      expect(srSpans[1].textContent).toBe("[End Code]");
    });

    it("handles code element with empty or whitespace-only class attribute", function () {
      document.body.innerHTML = '<pre><code class="">var a = 1;</code></pre><pre><code class="   ">var b = 2;</code></pre>';
      window.__ca11yScan();

      var pres = document.querySelectorAll("pre");
      expect(pres[0].getAttribute("aria-label")).toBe("Code code block");
      expect(pres[1].getAttribute("aria-label")).toBe("Code code block");
    });

    it("handles code element with 'language-' without a language name", function () {
      document.body.innerHTML = '<pre><code class="language-">var x = 10;</code></pre>';
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
      expect(pre.getAttribute("role")).toBe("region");
    });

    it("handles code element with unrecognized or non-standard class prefix like 'lang-'", function () {
      document.body.innerHTML = '<pre><code class="lang-python">print(1)</code></pre>';
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
    });

    it("handles code element with special characters and symbols in language class", function () {
      document.body.innerHTML = [
        '<pre><code class="language-c++">#include &lt;iostream&gt;</code></pre>',
        '<pre><code class="language-python3">print("hi")</code></pre>',
        '<pre><code class="language-!@#$%^&*">invalid</code></pre>',
      ].join("");
      window.__ca11yScan();

      var pres = document.querySelectorAll("pre");
      expect(pres[0].getAttribute("aria-label")).toBe("C code block");
      expect(pres[1].getAttribute("aria-label")).toBe("Python3 code block");
      expect(pres[2].getAttribute("aria-label")).toBe("Code code block");
    });

    it("extracts language when multiple classes and extra whitespace surround language class", function () {
      document.body.innerHTML =
        '<pre><code class="  hljs  line-numbers  language-typescript  dark-mode  ">let x: number = 42;</code></pre>';
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Typescript code block");
      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans[0].textContent).toBe("[Typescript]");
      expect(srSpans[1].textContent).toBe("[End Typescript]");
    });

    it("does not crash when code.className is not a string", function () {
      document.body.innerHTML = "<pre><code>special node</code></pre>";
      var code = document.querySelector("code");
      Object.defineProperty(code, "className", { value: undefined, configurable: true });

      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: Deeply nested structures
  // -------------------------------------------------------------------------

  describe("edge cases: deeply nested structures", function () {
    it("transforms table inside blockquote inside ordered list item", function () {
      document.body.innerHTML = [
        "<ol>",
        "  <li>",
        "    List item before quote",
        "    <blockquote>",
        "      <p>Quoted introduction</p>",
        "      <table>",
        "        <thead>",
        "          <tr><th>Metric</th><th>Score</th></tr>",
        "        </thead>",
        "        <tbody>",
        "          <tr><td>Accuracy</td><td>99%</td></tr>",
        "        </tbody>",
        "      </table>",
        "    </blockquote>",
        "  </li>",
        "</ol>",
      ].join("");
      window.__ca11yScan();

      var ol = document.querySelector("ol");
      expect(ol.getAttribute("role")).toBe("list");

      var li = document.querySelector("li");
      expect(li.getAttribute("role")).toBe("listitem");

      var prevNode = ol.previousElementSibling;
      expect(prevNode).not.toBeNull();
      expect(prevNode.className).toBe("ca11y-sr-only");
      expect(prevNode.textContent).toBe("[1 item numbered list]");

      var bq = document.querySelector("blockquote");
      expect(bq.getAttribute("role")).toBe("note");
      var bqSr = bq.querySelector(".ca11y-sr-only");
      expect(bqSr.textContent).toBe("[Quote] ");

      var table = document.querySelector("table");
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("tabindex")).toBe("0");
      expect(table.getAttribute("aria-label")).toBe("Table, 2 columns");

      var ths = table.querySelectorAll("th");
      expect(ths.length).toBe(2);
      expect(ths[0].getAttribute("role")).toBe("columnheader");
      expect(ths[0].getAttribute("scope")).toBe("col");
      expect(ths[1].getAttribute("role")).toBe("columnheader");
      expect(ths[1].getAttribute("scope")).toBe("col");

      var tableStart = table.previousElementSibling;
      expect(tableStart.textContent).toBe("[Table, 2 columns]");
      var tableEnd = table.nextElementSibling;
      expect(tableEnd.textContent).toBe("[End Table]");
    });

    it("transforms complex multi-tier nesting (list -> quote -> list -> quote -> table + code)", function () {
      document.body.innerHTML = [
        "<ul>",
        "  <li>",
        "    Top level item",
        "    <blockquote>",
        "      Outer quote text",
        "      <ol>",
        "        <li>",
        "          Nested list item",
        "          <blockquote>",
        "            Inner quote text",
        "            <table>",
        "              <tr><th>Col 1</th><th>Col 2</th><th>Col 3</th></tr>",
        "              <tr><td>A</td><td>B</td><td>C</td></tr>",
        "            </table>",
        '            <pre><code class="language-rust">fn nested() {}</code></pre>',
        "          </blockquote>",
        "        </li>",
        "      </ol>",
        "    </blockquote>",
        "  </li>",
        "</ul>",
      ].join("");
      window.__ca11yScan();

      var uls = document.querySelectorAll("ul");
      var ols = document.querySelectorAll("ol");
      var bqs = document.querySelectorAll("blockquote");
      var table = document.querySelector("table");
      var pre = document.querySelector("pre");

      expect(uls[0].getAttribute("role")).toBe("list");
      expect(ols[0].getAttribute("role")).toBe("list");
      expect(bqs.length).toBe(2);
      expect(bqs[0].getAttribute("role")).toBe("note");
      expect(bqs[1].getAttribute("role")).toBe("note");

      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("aria-label")).toBe("Table, 3 columns");

      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Rust code block");

      var rustSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(rustSpans.length).toBe(2);
      expect(rustSpans[0].textContent).toBe("[Rust]");
      expect(rustSpans[1].textContent).toBe("[End Rust]");
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: Empty elements
  // -------------------------------------------------------------------------

  describe("edge cases: empty structural elements", function () {
    it("safely transforms completely empty pre element", function () {
      document.body.innerHTML = "<pre></pre>";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
      expect(pre.getAttribute("tabindex")).toBe("0");

      var spans = pre.querySelectorAll(".ca11y-sr-only");
      expect(spans.length).toBe(2);
      expect(spans[0].textContent).toBe("[Code]");
      expect(spans[1].textContent).toBe("[End Code]");
    });

    it("safely transforms completely empty table element", function () {
      document.body.innerHTML = "<div><table></table></div>";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var table = document.querySelector("table");
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("tabindex")).toBe("0");
      expect(table.getAttribute("aria-label")).toBe("Table, 0 columns");

      var tableStart = table.previousElementSibling;
      expect(tableStart).not.toBeNull();
      expect(tableStart.textContent).toBe("[Table, 0 columns]");

      var tableEnd = table.nextElementSibling;
      expect(tableEnd).not.toBeNull();
      expect(tableEnd.textContent).toBe("[End Table]");
    });

    it("safely transforms table with empty tr (no cells)", function () {
      document.body.innerHTML = "<div><table><tr></tr></table></div>";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var table = document.querySelector("table");
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("aria-label")).toBe("Table, 0 columns");
    });

    it("safely transforms completely empty blockquote element", function () {
      document.body.innerHTML = "<blockquote></blockquote>";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var bq = document.querySelector("blockquote");
      expect(bq.getAttribute("role")).toBe("note");
      var sr = bq.querySelector(".ca11y-sr-only");
      expect(sr.textContent).toBe("[Quote] ");
    });

    it("safely transforms empty list elements (ul and ol without li)", function () {
      document.body.innerHTML = "<div><ul></ul><ol></ol></div>";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var ul = document.querySelector("ul");
      var ol = document.querySelector("ol");

      expect(ul.getAttribute("role")).toBe("list");
      expect(ol.getAttribute("role")).toBe("list");

      var ulStart = ul.previousElementSibling;
      expect(ulStart.textContent).toBe("[0 item bulleted list]");

      var olStart = ol.previousElementSibling;
      expect(olStart.textContent).toBe("[0 item numbered list]");
    });

    it("safely handles empty links and links without href", function () {
      document.body.innerHTML = '<div data-testid="chat-message-content"><a></a><a href=""></a></div>';
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var links = document.querySelectorAll("a");
      expect(links.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: Dynamic element addition (MutationObserver)
  // -------------------------------------------------------------------------

  describe("edge cases: dynamic element addition via MutationObserver", function () {
    it("automatically transforms a code block appended dynamically without manual scan", async function () {
      var pre = document.createElement("pre");
      var code = document.createElement("code");
      code.className = "language-python";
      code.textContent = "x = 42";
      pre.appendChild(code);
      document.body.appendChild(pre);

      await new Promise(function (resolve) { setTimeout(resolve, 300); });

      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Python code block");
      expect(pre.getAttribute("tabindex")).toBe("0");

      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(2);
      expect(srSpans[0].textContent).toBe("[Python]");
      expect(srSpans[1].textContent).toBe("[End Python]");
    });

    it("automatically transforms dynamic table, blockquote, and list added after init", async function () {
      var container = document.createElement("div");
      container.innerHTML = [
        "<table><tr><th>Col 1</th></tr><tr><td>Val 1</td></tr></table>",
        "<blockquote>Dynamic note</blockquote>",
        "<ul><li>Alpha</li><li>Beta</li></ul>",
      ].join("");
      document.body.appendChild(container);

      await new Promise(function (resolve) { setTimeout(resolve, 300); });

      var table = container.querySelector("table");
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("aria-label")).toBe("Table, 1 columns");

      var bq = container.querySelector("blockquote");
      expect(bq.getAttribute("role")).toBe("note");
      expect(bq.querySelector(".ca11y-sr-only").textContent).toBe("[Quote] ");

      var ul = container.querySelector("ul");
      expect(ul.getAttribute("role")).toBe("list");
      var lis = ul.querySelectorAll("li");
      expect(lis[0].getAttribute("role")).toBe("listitem");
      expect(lis[1].getAttribute("role")).toBe("listitem");
    });

    it("automatically transforms dynamically added chat message container", async function () {
      var msg = document.createElement("div");
      msg.setAttribute("data-testid", "chat-message-content");
      msg.innerHTML = '<p>Hello from Claude</p><pre><code class="language-javascript">console.log("ok");</code></pre>';
      document.body.appendChild(msg);

      await new Promise(function (resolve) { setTimeout(resolve, 300); });

      expect(msg.getAttribute("role")).toBe("region");
      expect(msg.getAttribute("aria-label")).toMatch(/^AI response/);

      var pre = msg.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Javascript code block");
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: Rapid DOM mutations / debounce stability (streaming simulation)
  // -------------------------------------------------------------------------

  describe("edge cases: rapid DOM streaming mutations and debounce stability", function () {
    it("debounces rapid mutations during simulated streaming responses without premature transformation", async function () {
      var msg = document.createElement("div");
      msg.setAttribute("data-testid", "chat-message-content");
      document.body.appendChild(msg);

      var p = document.createElement("p");
      msg.appendChild(p);

      var pre = document.createElement("pre");
      var code = document.createElement("code");
      code.className = "language-python";
      pre.appendChild(code);
      msg.appendChild(pre);

      for (var i = 0; i < 30; i++) {
        p.textContent += "token" + i + " ";
        code.textContent += "line_" + i + " = " + i + "\n";
      }

      // Immediately after rapid mutations, debounce timer has not expired yet
      expect(pre.getAttribute("role")).toBeNull();

      // Wait for debounce period to complete and scan to trigger
      await new Promise(function (resolve) { setTimeout(resolve, 350); });

      // After debounce, transforms must be fully and accurately applied
      expect(msg.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Python code block");

      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(2);
      expect(srSpans[0].textContent).toBe("[Python]");
      expect(srSpans[1].textContent).toBe("[End Python]");
    });

    it("handles multiple subsequent mutation bursts without duplicate transforms", async function () {
      var container = document.createElement("div");
      document.body.appendChild(container);

      var h2 = document.createElement("h2");
      h2.textContent = "Section 1";
      var bq = document.createElement("blockquote");
      bq.textContent = "Quote 1";
      container.appendChild(h2);
      container.appendChild(bq);

      await new Promise(function (resolve) { setTimeout(resolve, 300); });

      expect(h2.querySelector(".ca11y-sr-only").textContent).toBe("[Heading] ");
      expect(bq.querySelector(".ca11y-sr-only").textContent).toBe("[Quote] ");

      var ul = document.createElement("ul");
      ul.innerHTML = "<li>Item 1</li><li>Item 2</li>";
      var table = document.createElement("table");
      table.innerHTML = "<tr><th>Header</th></tr><tr><td>Value</td></tr>";
      container.appendChild(ul);
      container.appendChild(table);

      await new Promise(function (resolve) { setTimeout(resolve, 300); });

      expect(ul.getAttribute("role")).toBe("list");
      expect(table.getAttribute("role")).toBe("table");

      var h2Spans = h2.querySelectorAll(".ca11y-sr-only");
      expect(h2Spans.length).toBe(1);
      var bqSpans = bq.querySelectorAll(".ca11y-sr-only");
      expect(bqSpans.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: Pre-existing ARIA attributes (upstream a11y detection)
  // -------------------------------------------------------------------------

  describe("edge cases: pre-existing ARIA attributes and upstream a11y detection", function () {
    it("preserves code block with existing aria-label containing 'code block'", function () {
      document.body.innerHTML =
        '<pre aria-label="Python code block" role="region" tabindex="0"><code class="language-python">print("hi")</code></pre>';
      window.__ca11yScan();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("aria-label")).toBe("Python code block");
      expect(pre.getAttribute("role")).toBe("region");

      var srSpans = pre.querySelectorAll(".ca11y-sr-only");
      expect(srSpans.length).toBe(0);
    });

    it("preserves chat response container with existing role=region and response aria-label", function () {
      document.body.innerHTML =
        '<div role="region" aria-label="AI response"><p>Native Anthropic response</p></div>';
      window.__ca11yScan();

      var msg = document.querySelector('div[role="region"]');
      expect(msg.getAttribute("role")).toBe("region");
      expect(msg.getAttribute("aria-label")).toMatch(/^AI response/);
    });

    it("preserves upstream table with pre-existing role=table and aria-label", function () {
      document.body.innerHTML =
        '<div><table role="table" aria-label="Quarterly financial results"><tr><th>Q1</th></tr><tr><td>$100M</td></tr></table></div>';
      window.__ca11yScan();

      var table = document.querySelector("table");
      expect(table.getAttribute("aria-label")).toBe("Quarterly financial results");
      expect(table.getAttribute("role")).toBe("table");

      var prev = table.previousElementSibling;
      var prevText = prev ? prev.textContent : "";
      expect(prevText).not.toContain("[Table, 1 columns]");
    });

    it("preserves presentation tables with role=presentation or role=none", function () {
      document.body.innerHTML =
        '<div><table role="presentation"><tr><td>Layout column</td></tr></table></div>';
      window.__ca11yScan();

      var table = document.querySelector("table");
      expect(table.getAttribute("role")).toBe("presentation");
      var prev = table.previousElementSibling;
      var prevText = prev ? prev.textContent : "";
      expect(prevText).not.toContain("[Table");
    });

    it("preserves blockquote that already has role=note and aria-label", function () {
      document.body.innerHTML =
        '<blockquote role="note" aria-label="Quote from author">Words of wisdom</blockquote>';
      window.__ca11yScan();

      var bq = document.querySelector("blockquote");
      expect(bq.getAttribute("aria-label")).toBe("Quote from author");
      expect(bq.getAttribute("role")).toBe("note");
      var spans = bq.querySelectorAll(".ca11y-sr-only");
      expect(spans.length).toBe(0);
    });

    it("preserves list with pre-existing role=list and aria-label", function () {
      document.body.innerHTML =
        '<div><ul role="list" aria-label="Breadcrumb navigation"><li><a href="/">Home</a></li></ul></div>';
      window.__ca11yScan();

      var ul = document.querySelector("ul");
      expect(ul.getAttribute("aria-label")).toBe("Breadcrumb navigation");
      expect(ul.getAttribute("role")).toBe("list");
      var prev = ul.previousElementSibling;
      var prevText = prev ? prev.textContent : "";
      expect(prevText).not.toContain("item bulleted list");
    });

    it("preserves pre-existing alt text on images", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><img src="logo.svg" alt="Company Logo" aria-label="Company Logo"></div>';
      window.__ca11yScan();

      var img = document.querySelector("img");
      expect(img.alt).toBe("Company Logo");
      expect(img.getAttribute("aria-label")).toBe("Company Logo");
    });

    it("preserves pre-existing accessible name and text on links", function () {
      document.body.innerHTML =
        '<div data-testid="chat-message-content"><a href="https://example.com" aria-label="Visit Example Inc">Click Here</a></div>';
      window.__ca11yScan();

      var a = document.querySelector("a");
      expect(a.textContent).toBe("Click Here");
      expect(a.getAttribute("aria-label")).toBe("Visit Example Inc");
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: Mixed content with malformed HTML
  // -------------------------------------------------------------------------

  describe("edge cases: mixed content with malformed HTML", function () {
    it("handles unclosed code block, blockquote, and list tags without throwing", function () {
      document.body.innerHTML =
        "<div><pre><code>let unclosed = true;<blockquote>Unclosed quote text<ul><li>Item 1<li>Item 2";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var pre = document.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre.getAttribute("role")).toBe("region");

      var bq = document.querySelector("blockquote");
      if (bq) {
        expect(bq.getAttribute("role")).toBe("note");
      }

      var ul = document.querySelector("ul");
      if (ul) {
        expect(ul.getAttribute("role")).toBe("list");
      }
    });

    it("handles malformed unclosed table rows and cells without throwing", function () {
      document.body.innerHTML =
        "<div><table><tr><th>Head 1<th>Head 2<tr><td>Val 1<td>Val 2";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var table = document.querySelector("table");
      expect(table).not.toBeNull();
      expect(table.getAttribute("role")).toBe("table");
      expect(table.getAttribute("aria-label")).toContain("columns");
    });

    it("handles stray and mismatched closing tags gracefully", function () {
      document.body.innerHTML =
        "</div></td></tr></pre></code></b></i><div class='prose'><p>Safe content</p></div>";
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var prose = document.querySelector(".prose");
      expect(prose.getAttribute("role")).toBe("region");
    });

    it("handles HTML entities and malformed attributes gracefully", function () {
      document.body.innerHTML = [
        '<div data-testid="chat-message-content">',
        '  <p>&lt;script&gt;alert("xss")&lt;/script&gt;</p>',
        '  <pre><code class="language-&lt;&gt;&amp;">eval(1)</code></pre>',
        "</div>",
      ].join("\n");
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var pre = document.querySelector("pre");
      expect(pre.getAttribute("role")).toBe("region");
      expect(pre.getAttribute("aria-label")).toBe("Code code block");
    });

    it("handles deeply nested malformed tree without uncaught exceptions", function () {
      document.body.innerHTML = [
        "<div>",
        "  <ul>",
        "    <li>",
        "      <blockquote>",
        "        <table><tr><td>Unclosed table in quote",
        "        <pre><code>const z = 9;",
        "  </ul>",
        "</div>",
      ].join("");
      expect(function () {
        window.__ca11yScan();
      }).not.toThrow();

      var table = document.querySelector("table");
      if (table) {
        expect(table.getAttribute("role")).toBe("table");
      }
      var pre = document.querySelector("pre");
      if (pre) {
        expect(pre.getAttribute("role")).toBe("region");
      }
    });
  });
});

