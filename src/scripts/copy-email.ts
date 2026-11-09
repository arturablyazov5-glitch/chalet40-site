const toast = document.querySelector<HTMLElement>("[data-copy-email-toast]");
let hideTimer: number | undefined;
let closeTimer: number | undefined;

const hideToast = () => {
  if (!toast) return;

  toast.classList.remove("is-visible");
  toast.classList.add("is-hiding");

  closeTimer = window.setTimeout(() => {
    if (typeof toast.hidePopover === "function" && toast.matches(":popover-open")) {
      toast.hidePopover();
    }
    toast.hidden = true;
    toast.classList.remove("is-hiding");
  }, 150);
};

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const email = target?.closest<HTMLAnchorElement>('a[href^="mailto:"]');
  if (!email || !navigator.clipboard?.writeText) return;

  event.preventDefault();
  const rawAddress = email.getAttribute("href")!.slice(7).split("?")[0];
  let address = rawAddress;
  try {
    address = decodeURIComponent(rawAddress);
  } catch {
    // Malformed percent-encoding: fall back to the raw address.
  }

  try {
    await navigator.clipboard.writeText(address);
  } catch {
    window.location.href = email.href;
    return;
  }

  if (!toast) return;

  clearTimeout(hideTimer);
  clearTimeout(closeTimer);

  toast.textContent = document.documentElement.lang === "en" ? "Email copied" : "Почта скопирована";
  toast.classList.remove("is-hiding");
  toast.hidden = false;
  if (typeof toast.showPopover === "function") {
    if (!toast.matches(":popover-open")) toast.showPopover();
  } else {
    toast.removeAttribute("popover");
  }

  if (!toast.classList.contains("is-visible")) {
    // Force a style flush so the is-visible transition actually runs.
    void toast.offsetWidth;
    toast.classList.add("is-visible");
  }

  hideTimer = window.setTimeout(hideToast, 2200);
});
