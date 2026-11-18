import "@testing-library/jest-dom";

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }

    observe(target) {
      this.callback([{ isIntersecting: true, intersectionRatio: 1, target }], this);
    }

    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
