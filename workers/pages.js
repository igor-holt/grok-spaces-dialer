import { DISCLAIMER, VALUE_PROP } from "./constants.js";

/**
 * Public HTML. CSS and the search script are inlined so the demo does not
 * request /assets or /static. Those prefixes are public at Cloudflare Access,
 * but this build does not depend on them.
 *
 * User search text is never interpolated into this HTML. The script reads the
 * API response and writes it with textContent.
 */

const CLIENT_SCRIPT = [
  "(function () {",
  "  var form = document.getElementById('search-form');",
  "  var results = document.getElementById('results');",
  "  var summary = document.getElementById('summary');",
  "  var source = document.getElementById('source');",
  "  var hear = document.getElementById('hear');",
  "  var status = document.getElementById('status');",
  "  var lastSpoken = '';",
  "  var spaceUrl = /^https:\\/\\/x\\.com\\/i\\/spaces\\/[A-Za-z0-9_]+$/;",
  "",
  "  function clearResults() {",
  "    while (results.firstChild) results.removeChild(results.firstChild);",
  "  }",
  "",
  "  function render(payload) {",
  "    clearResults();",
  "    var data = payload || {};",
  "    lastSpoken = data.spoken_summary || '';",
  "    summary.textContent = lastSpoken || 'Search for a topic to hear a short list.';",
  "    hear.disabled = !data.spoken_summary;",
  "    if (data.error) {",
  "      status.textContent = data.message || 'Search failed.';",
  "      if (data.source === 'sample') {",
  "        source.textContent = 'Sample mode is on, but this response is not a list of sample Spaces.';",
  "      } else {",
  "        source.textContent = 'The live X API did not return a list.';",
  "      }",
  "      if (!data.spaces || !data.spaces.length) return;",
  "    } else if (data.source === 'live') {",
  "      status.textContent = '';",
  "      source.textContent = 'Live results from the X API.';",
  "    } else if (data.source === 'sample') {",
  "      status.textContent = '';",
  "      source.textContent = data.notice || 'Sample data. These are not live Spaces.';",
  "    } else {",
  "      status.textContent = data.message || '';",
  "      source.textContent = '';",
  "    }",
  "    var spaces = data.spaces || [];",
  "    if (!spaces.length) {",
  "      var empty = document.createElement('li');",
  "      empty.textContent = 'No Spaces to show.';",
  "      results.appendChild(empty);",
  "      return;",
  "    }",
  "    spaces.forEach(function (space) {",
  "      var item = document.createElement('li');",
  "      item.className = 'space';",
  "      if (typeof space.state === 'string' && /^[a-z]{1,20}$/i.test(space.state)) {",
  "        item.setAttribute('data-state', space.state.toLowerCase());",
  "      }",
  "      var title = document.createElement('h3');",
  "      title.textContent = space.title || 'Untitled Space';",
  "      item.appendChild(title);",
  "      var host = space.host || {};",
  "      var hostText = 'Host not named by the X API';",
  "      if (host.username) {",
  "        hostText = host.name ? 'Host: ' + host.name + ' (@' + host.username + ')' : 'Host: @' + host.username;",
  "      } else if (host.name) {",
  "        hostText = 'Host: ' + host.name;",
  "      }",
  "      var bits = [hostText, 'State: ' + (space.state || 'unknown')];",
  "      if (typeof space.participant_count === 'number') {",
  "        bits.push(space.participant_count + ' participants');",
  "      }",
  "      if (space.scheduled_start) bits.push('Scheduled start: ' + space.scheduled_start);",
  "      var meta = document.createElement('p');",
  "      meta.textContent = bits.join(' · ');",
  "      item.appendChild(meta);",
  "      if (typeof space.x_url === 'string' && spaceUrl.test(space.x_url)) {",
  "        var link = document.createElement('a');",
  "        link.href = space.x_url;",
  "        link.target = '_blank';",
  "        link.rel = 'noopener noreferrer';",
  "        link.textContent = 'Open in X';",
  "        item.appendChild(link);",
  "      } else if (data.source === 'sample') {",
  "        var note = document.createElement('p');",
  "        note.className = 'note';",
  "        note.textContent = 'Sample — no live X link.';",
  "        item.appendChild(note);",
  "      }",
  "      results.appendChild(item);",
  "    });",
  "  }",
  "",
  "  form.addEventListener('submit', function (event) {",
  "    event.preventDefault();",
  "    var data = new FormData(form);",
  "    var params = new URLSearchParams();",
  "    params.set('q', String(data.get('q') || ''));",
  "    params.set('state', String(data.get('state') || 'all'));",
  "    status.textContent = 'Searching…';",
  "    source.textContent = '';",
  "    summary.textContent = '';",
  "    hear.disabled = true;",
  "    lastSpoken = '';",
  "    clearResults();",
  "    fetch('/api/search?' + params.toString(), { headers: { accept: 'application/json' } })",
  "      .then(function (response) {",
  "        return response.json().then(function (payload) {",
  "          render(payload || {});",
  "        });",
  "      })",
  "      .catch(function () {",
  "        status.textContent = 'The search request failed before any results arrived.';",
  "        source.textContent = '';",
  "      });",
  "  });",
  "",
  "  hear.addEventListener('click', function () {",
  "    if (!lastSpoken) return;",
  "    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {",
  "      status.textContent = 'This browser has no speechSynthesis. The summary is on the page as text.';",
  "      return;",
  "    }",
  "    window.speechSynthesis.cancel();",
  "    var utter = new SpeechSynthesisUtterance(lastSpoken);",
  "    utter.rate = 1;",
  "    window.speechSynthesis.speak(utter);",
  "  });",
  "",
  "  if (!window.speechSynthesis) hear.textContent = 'Speech unavailable';",
  "})();",
].join("\n");

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f3ecdf;
    color: #1d1a16;
    font: 18px/1.5 "Avenir Next", "Segoe UI", sans-serif;
  }
  .skip {
    position: absolute;
    left: 0.75rem;
    top: 0.75rem;
    transform: translateY(-150%);
    background: #1d1a16;
    color: #fffaf3;
    padding: 0.5rem 0.75rem;
  }
  .skip:focus { transform: none; }
  .wrap { width: min(40rem, 100%); margin: 0 auto; padding: 1.25rem; }
  main { flex: 1; }
  h1, h2, h3 { font-family: Palatino, "Palatino Linotype", Georgia, serif; line-height: 1.2; }
  h1 { font-size: 2.1rem; margin: 0.2rem 0 0.4rem; }
  h1 a { color: inherit; text-decoration: none; }
  h2 { font-size: 1.4rem; margin: 1.5rem 0 0.4rem; }
  .eyebrow { margin: 0; letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.78rem; color: #3f382f; }
  .lede { font-size: 1.2rem; margin: 0.4rem 0 0.8rem; }
  .disclaimer, .note { background: #fffaf3; border: 1px solid #ddd2c3; border-radius: 8px; padding: 0.75rem 0.9rem; }
  .disclaimer { border-left: 4px solid #8f2d2a; }
  nav, footer { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: center; }
  nav { margin: 0.5rem 0 1rem; }
  a { color: #8f2d2a; }
  a:hover { text-decoration-thickness: 2px; }
  label { display: block; font-weight: 650; margin: 0.85rem 0 0.3rem; }
  input, select, button {
    width: 100%;
    min-height: 48px;
    font: inherit;
    color: #1d1a16;
    background: #fffaf3;
    border: 1px solid #1d1a16;
    border-radius: 8px;
    padding: 0.4rem 0.7rem;
  }
  button { background: #1d1a16; color: #fffaf3; cursor: pointer; }
  button[disabled] { cursor: not-allowed; opacity: 0.55; }
  :focus-visible { outline: 3px solid #8f2d2a; outline-offset: 2px; }
  #output { margin-top: 1.25rem; }
  #source { font-weight: 650; min-height: 1.5rem; }
  #status { min-height: 1.5rem; color: #3f382f; }
  ul { list-style: none; padding: 0; margin: 0; }
  .space {
    background: #fffaf3;
    border: 1px solid #ddd2c3;
    border-left: 4px solid #1d1a16;
    border-radius: 8px;
    padding: 0.85rem 1rem;
    margin: 0.75rem 0;
  }
  .space[data-state="live"] { border-left-color: #8f2d2a; }
  .space[data-state="scheduled"] { border-left-color: #1f6b4a; }
  .space h3 { margin: 0 0 0.3rem; font-size: 1.25rem; }
  .space p { margin: 0.3rem 0; overflow-wrap: anywhere; }
  footer { border-top: 1px solid #ddd2c3; margin-top: 2rem; padding-top: 1rem; color: #3f382f; }
  footer p { width: 100%; margin: 0.2rem 0; }
  @media (prefers-reduced-motion: reduce) {
    * { scroll-behavior: auto; }
  }
`;

function shell({ title, description, main, script, skipHref, skipLabel }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#f3ecdf">
  <title>${title}</title>
  <link rel="icon" href="/favicon.ico">
  <style>${CSS}</style>
</head>
<body>
  <a class="skip" href="${skipHref}">${skipLabel}</a>
  <header class="wrap">
    <p class="eyebrow">X Spaces discovery</p>
    <h1><a href="/">Grok Spaces Dialer</a></h1>
    <nav>
      <a href="https://github.com/igor-holt/grok-spaces-dialer">GitHub</a>
      <a href="https://github.com/igor-holt/grok-spaces-dialer/blob/main/docs/WORKFLOW.md">Docs</a>
      <a href="https://github.com/igor-holt/grok-spaces-dialer/blob/main/README.md">README</a>
    </nav>
  </header>
  <main class="wrap" id="content">
    ${main}
  </main>
  <footer class="wrap">
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="https://github.com/igor-holt/grok-spaces-dialer">GitHub</a>
    <a href="https://github.com/igor-holt/grok-spaces-dialer/blob/main/docs/WORKFLOW.md">Docs</a>
    <p>Operated by Igor Holt / Kovach Enterprises, Pasadena, Maryland.</p>
    <p><a href="mailto:igor@kovachenterprises.com">igor@kovachenterprises.com</a></p>
  </footer>
  ${script ? `<script>${CLIENT_SCRIPT}</script>` : ""}
</body>
</html>`;
}

export function renderHome() {
  return shell({
    title: "Grok Spaces Dialer",
    description: VALUE_PROP,
    skipHref: "#search-form",
    skipLabel: "Skip to search",
    script: true,
    main: `
      <p class="lede">${VALUE_PROP}</p>
      <p class="disclaimer">${DISCLAIMER}</p>
      <p>Type a topic. This page shows public Spaces from the X API: title, host, whether the Space is live or scheduled, participant count when X includes one, and a link that opens the Space on X. Until an operator sets the server token, a search returns labeled sample Spaces and does not call X.</p>
      <form id="search-form" action="/api/search" method="get">
        <label for="q">Topic</label>
        <input id="q" name="q" type="search" maxlength="80" required placeholder="AI agents" autocomplete="off" enterkeyhint="search">
        <label for="state">State</label>
        <select id="state" name="state">
          <option value="all" selected>All</option>
          <option value="live">Live</option>
          <option value="scheduled">Scheduled</option>
        </select>
        <button type="submit">Search Spaces</button>
      </form>
      <div id="output" aria-live="polite">
        <h2>Spoken summary</h2>
        <p id="summary">Search for a topic to hear a short list.</p>
        <button type="button" id="hear" disabled aria-describedby="summary">Hear summary</button>
        <h2>Spaces</h2>
        <p id="source"></p>
        <p id="status" role="status"></p>
        <ul id="results"></ul>
      </div>
    `,
  });
}

export function renderPrivacy() {
  return shell({
    title: "Privacy policy · Grok Spaces Dialer",
    description: "Privacy policy for the Grok Spaces Dialer discovery prototype.",
    skipHref: "#content",
    skipLabel: "Skip to policy",
    script: false,
    main: `
      <h2>Privacy policy</h2>
      <p>Effective November 10, 2026.</p>
      <p>Grok Spaces Dialer is a small open-source prototype operated by Igor Holt / Kovach Enterprises, Pasadena, Maryland, United States. Contact: <a href="mailto:igor@kovachenterprises.com">igor@kovachenterprises.com</a>.</p>
      <p>This policy describes the public website. The prototype does not place or receive phone calls. ${DISCLAIMER} It does not record Space audio.</p>
      <h2>What the site does</h2>
      <p>You type a topic. When an X API bearer token is configured, the Worker asks the X API for public Spaces that match, then shows a short list: title, host, live or scheduled state, participant count when X includes <code>participant_count</code>, and a link to <code>https://x.com/i/spaces/&lt;id&gt;</code>. A button can read the short summary with your browser’s speechSynthesis API.</p>
      <h2>Information the Worker handles</h2>
      <ul>
        <li>The search topic and the live, scheduled, or all filter. They are sent to this Worker in the query string of <code>GET /api/search</code>. When a token is configured, the topic is sent to X as the search query.</li>
        <li>Public Space metadata returned by the X API: Space id, title, state, host id, host name and username when X provides them, participant count, and scheduled start.</li>
        <li>Standard Cloudflare Worker request logs, which can include IP address, user agent, timestamp, and the request URL. The URL includes your search topic. This prototype does not copy those logs into its own database.</li>
        <li>A short-lived in-memory count of searches per IP address, used only to slow repeated calls. The address comes from Cloudflare’s CF-Connecting-IP header. The count is forgotten after about a minute and is not written to a database.</li>
        <li>A cache of successful live search responses, kept for about 60 seconds, in Worker memory and, when available, the Cloudflare cache. The cache key is the topic, the state filter, and the result count. It does not include the bearer token.</li>
      </ul>
      <h2>When no X API token is configured</h2>
      <p>The Worker does not call X. It returns a few fictional sample Spaces and labels the response as sample data. Your topic is still received by the Worker so it can filter those samples, and it can still appear in Cloudflare request logs because it is part of the URL.</p>
      <h2>What this site does not collect</h2>
      <ul>
        <li>No account, name, email, or phone-number field.</li>
        <li>No Space audio, recordings, or transcripts of a Space.</li>
        <li>No advertising, analytics product, tracking pixel, or third-party script. The pages do not load fonts, styles, or images from another site.</li>
        <li>No cookies set by this application. Cloudflare Access protects other paths on this hostname and may set its own cookie there. The public pages and search API are not designed to use that cookie.</li>
        <li>No microphone, camera, or location access. speechSynthesis speaks text the page already shows. This site does not send that text to a separate speech vendor. Your browser may speak on the device or through the browser vendor’s own speech service.</li>
      </ul>
      <p>The X bearer token is a Worker secret named <code>X_BEARER_TOKEN</code>. It is sent only from the Worker to the X API. It is not included in pages or API responses.</p>
      <h2>Who receives data</h2>
      <p>X Corp. receives the search query when a token is configured, and returns public Space metadata. Cloudflare, Inc. hosts the Worker. We do not sell personal information. Their policies are at <a href="https://x.com/en/privacy">x.com/privacy</a> and <a href="https://www.cloudflare.com/privacypolicy/">cloudflare.com/privacypolicy</a>.</p>
      <h2>Retention</h2>
      <p>There is no application database. Cached search responses expire after about 60 seconds. Cloudflare log retention follows the account’s Cloudflare settings, which this prototype does not extend.</p>
      <h2>Children</h2>
      <p>This site is not directed at children under 13, and it does not knowingly collect personal information from them.</p>
      <h2>Changes</h2>
      <p>If this policy changes, the effective date above changes with the code that is deployed. The source is <a href="https://github.com/igor-holt/grok-spaces-dialer">github.com/igor-holt/grok-spaces-dialer</a>.</p>
      <h2>Contact</h2>
      <p>Igor Holt / Kovach Enterprises<br>Pasadena, Maryland, USA<br><a href="mailto:igor@kovachenterprises.com">igor@kovachenterprises.com</a></p>
    `,
  });
}

export function renderTerms() {
  return shell({
    title: "Terms of use · Grok Spaces Dialer",
    description: "Terms of use for the Grok Spaces Dialer discovery prototype.",
    skipHref: "#content",
    skipLabel: "Skip to terms",
    script: false,
    main: `
      <h2>Terms of use</h2>
      <p>Effective November 10, 2026.</p>
      <p>These terms cover the Grok Spaces Dialer prototype operated by Igor Holt / Kovach Enterprises, Pasadena, Maryland, United States. Contact: <a href="mailto:igor@kovachenterprises.com">igor@kovachenterprises.com</a>.</p>
      <h2>A prototype, provided as-is</h2>
      <p>The service is an open-source discovery prototype. It is provided as-is and as-available, without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. Spaces start and end without notice. Search results can be empty, delayed, or wrong. To the fullest extent allowed by law, the operator is not liable for any loss or damage arising from use of the prototype.</p>
      <h2>What it does not do</h2>
      <p>${DISCLAIMER} The prototype searches public X Spaces by topic and gives you a link to open a Space on X at <code>https://x.com/i/spaces/&lt;id&gt;</code>. It does not join a Space, stream Space audio, bridge Space audio to a phone, place phone calls, or speak in a Space on your behalf.</p>
      <h2>X Developer Agreement and Policy</h2>
      <p>The operator’s use of the X API is subject to the <a href="https://developer.x.com/en/developer-terms/agreement">X Developer Agreement</a> and the <a href="https://developer.x.com/en/developer-terms/policy">X Developer Policy</a>, and to the X rules that apply to this use. The API is used to search and look up public Spaces and to show that public metadata with a link back to X. The prototype does not sell X content, does not keep a database of Spaces beyond a cache of about 60 seconds, and does not use Spaces data for advertising.</p>
      <p>You are responsible for how you use X when you open a link. X’s own terms apply on X. This prototype is not an official product of X Corp. or xAI.</p>
      <h2>Acceptable use</h2>
      <p>Do not abuse the search endpoint, attempt to extract the server’s credentials, or use the prototype to violate the law or X’s rules. The operator may rate-limit or stop the service at any time.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of Maryland, United States, without regard to conflict-of-law rules. Legal actions relating to the prototype must be brought in the state or federal courts located in Maryland.</p>
      <h2>Contact</h2>
      <p>Igor Holt / Kovach Enterprises<br>Pasadena, Maryland, USA<br><a href="mailto:igor@kovachenterprises.com">igor@kovachenterprises.com</a></p>
      <p>Source: <a href="https://github.com/igor-holt/grok-spaces-dialer">github.com/igor-holt/grok-spaces-dialer</a>.</p>
    `,
  });
}
