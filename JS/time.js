var dt = new Date();
const datetimeEl = document.getElementById("datetime");
if (datetimeEl) {
  datetimeEl.innerHTML = dt.toLocaleString();
}