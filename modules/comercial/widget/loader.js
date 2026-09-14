/**
 * Widget de personalização de capa — cola um <script> na página de produto da loja.
 *
 * Exemplo:
 *   <div id="customic-capa-widget"></div>
 *   <script src="https://SEU-SGC/widget/capa.js" data-sku="307849"></script>
 *
 * Integração Convertr (campo oculto na PDP):
 *   ao confirmar a arte, grava o código (CAPA-XXXXX) em #capa_codigo,
 *   dispara input/change e o CustomEvent capa_codigo:update.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var origin = new URL(script.src).origin;
  var sku = (script.getAttribute("data-sku") || "").trim();
  var modelo = (script.getAttribute("data-modelo") || "").trim();
  var targetId = script.getAttribute("data-target") || "customic-capa-widget";

  if (!sku) {
    var txt = document.body ? document.body.innerText : "";
    var m = txt.match(/SKU[:\s]*([A-Za-z0-9._-]{3,})/i);
    if (m) sku = m[1];
  }

  var el = document.getElementById(targetId);
  if (!el) {
    el = document.createElement("div");
    el.id = targetId;
    script.parentNode.insertBefore(el, script);
  }

  var params = new URLSearchParams();
  if (sku) params.set("sku", sku);
  if (modelo) params.set("modelo", modelo);
  var h1 = document.querySelector("h1");
  if (h1 && h1.textContent) params.set("q", h1.textContent.trim());
  params.set("ref", location.href);

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/modules/comercial/widget/embed.html?" + params.toString();
  iframe.title = "Personalize sua capa";
  iframe.setAttribute("allow", "clipboard-write");
  iframe.style.cssText =
    "width:100%;min-height:780px;border:0;border-radius:12px;display:block;background:#fff;";
  el.appendChild(iframe);

  var lastCode = "";
  var pendingObserver = null;
  var pendingTimer = null;

  function findCapaInput() {
    return (
      document.getElementById("capa_codigo") ||
      document.querySelector('input[name="capa_codigo"]')
    );
  }

  function stopPending() {
    if (pendingObserver) {
      pendingObserver.disconnect();
      pendingObserver = null;
    }
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  function applyToInput(code) {
    var input = findCapaInput();
    if (!input) return false;
    input.value = code;
    input.setAttribute("value", code);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function waitForInput() {
    if (pendingObserver || !lastCode) return;
    pendingObserver = new MutationObserver(function () {
      if (lastCode && applyToInput(lastCode)) stopPending();
    });
    pendingObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    pendingTimer = setTimeout(stopPending, 20000);
  }

  function setCapaCodigo(code) {
    code = String(code || "").trim();
    if (!code) return;
    lastCode = code;
    window.dispatchEvent(
      new CustomEvent("capa_codigo:update", { detail: { code: code } })
    );
    if (applyToInput(code)) stopPending();
    else waitForInput();
  }

  window.addEventListener("message", function (ev) {
    if (!ev.data || ev.source !== iframe.contentWindow) return;
    if (ev.data.type === "customic-capa-resize") {
      var h = Number(ev.data.height);
      if (h > 400) iframe.style.minHeight = h + "px";
      return;
    }
    if (ev.data.type === "customic-capa-saved") {
      setCapaCodigo(ev.data.codigoInterno);
    }
  });
})();
