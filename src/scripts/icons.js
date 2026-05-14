const ICONS = {
  "cube-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M48 170v196.92L240 480V284L48 170zM272 480l192-113.08V170L272 284zm176-122.36zM448 144L256 32 64 144l192 112 192-112z"/></svg>',
  "calendar-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M32 456a24 24 0 0024 24h400a24 24 0 0024-24V176H32zm320-244a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zm0 80a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zm-80-80a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zm0 80a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zm0 80a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zm-80-80a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zm0 80a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zm-80-80a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zm0 80a4 4 0 014-4h40a4 4 0 014 4v40a4 4 0 01-4 4h-40a4 4 0 01-4-4zM456 64h-55.92V32h-48v32H159.92V32h-48v32H56a23.8 23.8 0 00-24 23.77V144h448V87.77A23.8 23.8 0 00456 64z"/></svg>',
  "paper-plane-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M496 16L15.88 208 195 289 448 64 223 317l81 179L496 16z"/></svg>',
  "flag-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M102 480H64V57.37l4.69-4.68C72.14 49.23 92.78 32 160 32c37.21 0 78.83 14.71 115.55 27.68C305.12 70.13 333.05 80 352 80c42.83 0 72.72-14.25 73-14.4l23-11.14v259.43l-8.84 4.42C437.71 319 403.19 336 352 336c-24.14 0-54.38-7.14-86.39-14.71C229.63 312.79 192.43 304 160 304c-36.87 0-49.74 5.58-58 9.11z"/></svg>',
  "triangle-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 32L20 464h472L256 32z"/></svg>',
  "chevron-up-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="square" stroke-miterlimit="10" stroke-width="48" d="M112 328l144-144 144 144"/></svg>',
  "chevron-down-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="square" stroke-miterlimit="10" stroke-width="48" d="M112 184l144 144 144-144"/></svg>',
  "chevron-back-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="square" stroke-miterlimit="10" stroke-width="48" d="M328 112L184 256l144 144"/></svg>',
  "chevron-forward-sharp":
    '<svg class="tr-icon" viewBox="0 0 512 512" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="square" stroke-miterlimit="10" stroke-width="48" d="M184 112l144 144-144 144"/></svg>',
};

export function getIconSvg(name) {
  return ICONS[name] || "";
}
