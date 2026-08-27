/**
 * Widget de personalização de capa — cola um <script> na página de produto da loja.
 *
 * Exemplo:
 *   <div id="customic-capa-widget"></div>
 *   <script src="https://SEU-SGC/widget/capa.js" data-sku="307849"></script>
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

  window.addEventListener("message", function (ev) {
    if (!ev.data || ev.data.type !== "customic-capa-resize") return;
    if (ev.source !== iframe.contentWindow) return;
    var h = Number(ev.data.height);
    if (h > 400) iframe.style.minHeight = h + "px";
  });
})();
