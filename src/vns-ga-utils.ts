type SectionVisibilitySettings = {
  id: string;
  section: string;
  selector: string;
  scrollDepth: number;
  viewTime: number;
  customEvent: string;
};

type AddedSectionVisibilitySettings = Omit<
  SectionVisibilitySettings,
  "id" | "section"
>;
type TrackedSectionVisibilitySettings = SectionVisibilitySettings & {
  _isSent?: boolean;
  _timeOut?: NodeJS.Timeout | null;
};

type SectionTrackedData = {
  start: number;
  duration: number;
  minScrollDepth: number;
  maxScrollDepth: number;
  element: HTMLElement;
  selector: string;
  id: string;
  _sentEventIds?: string[];
};

type CookieOptions = {
  expires: number;
  path: string;
  domain: string;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  httpOnly: boolean;
  priority: "low" | "medium" | "high";
  sameParty: boolean;
};

export class VnsGaUtil {
  // Use a real private field so runtime access is blocked in JS too
  #version: string = "1.0.0";
  #trackingId: string = "";
  #sectionObserver!: IntersectionObserver;
  #sectionMap: Map<string, SectionTrackedData> = new Map();
  #sectionVisibility: Map<string, TrackedSectionVisibilitySettings> = new Map();
  #selectorVisibilityMap: Map<string, TrackedSectionVisibilitySettings[]> =
    new Map();
  #isVisibilityTrackingInitialized: boolean = false;

  constructor() {
    this.#_initTracking();
  }

  #_initTracking() {
    const metaUrl = import.meta.url;
    const url = new URL(metaUrl);
    const trackingId = url.searchParams.get("GID");
    if (!trackingId) {
      console.warn("Internal GA: No tracking ID found");
      return;
    }
    this.#trackingId = trackingId;
  }

  #_initSectionVisibilityTracking() {
    this.#sectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target;
        const selector = node.getAttribute("data-internal-view-selector");
        if (!selector) continue;
        if (entry.isIntersecting) {
          // due to the fact that multiple sections can have the same selector,
          // we need to use a unique id to track them separately
          const id = window.crypto.randomUUID();
          node.setAttribute("data-internal-view-id", id);
          const rect = node.getBoundingClientRect();
          // Calculate how much of the element is visible
          const elementTop = rect.top;
          const elementHeight = rect.height;
          const visibleTop = Math.max(0, -elementTop);
          const ratioTop = +((visibleTop / elementHeight) * 100).toFixed(2);
          this.#sectionMap.set(id, {
            start: Date.now(),
            duration: 0,
            minScrollDepth: ratioTop,
            maxScrollDepth: Math.min(ratioTop + entry.intersectionRatio * 100, 100),
            element: entry.target as HTMLElement,
            selector: selector,
            id: id,
          });
          const settings = this.#selectorVisibilityMap.get(selector) ?? [];
          for (const setting of settings) {
            const settingId = setting.id;
            if (setting.viewTime > 0) {
              const timeout = setTimeout(() => {
                const newSection = this.#sectionMap.get(id);
                if (!newSection) return;

                const sentIds = newSection._sentEventIds ?? [];
                if (sentIds.includes(settingId)) return;

                const scrollDepth =
                  newSection.maxScrollDepth - newSection.minScrollDepth;
                const settingScrollDepth = setting.scrollDepth;
                if (scrollDepth < settingScrollDepth) return;

                const event = setting.customEvent
                  ? setting.customEvent
                  : `view_${setting.section}`;
                const payload = {
                  event: event,
                  section: setting.section,
                  view_time: setting.viewTime,
                  scroll_depth: scrollDepth,
                };
                this.#_sendInternalGAEvent(payload);
                newSection._sentEventIds = [...sentIds, settingId];
                this.#sectionMap.set(id, newSection);
              }, setting.viewTime);
            }
          }
        } else {
          const outId = node.getAttribute("data-internal-view-id");
          if (!outId) continue;
          const tracked = this.#sectionMap.get(outId);
          if (!tracked) continue;
          tracked.duration = Date.now() - tracked.start;
          const scrollDepth = tracked.maxScrollDepth - tracked.minScrollDepth;
          const payload = {
            event: "section_view",
            section: selector,
            view_time: tracked.duration,
            scroll_depth: scrollDepth,
          };
          this.#_sendInternalGAEvent(payload);
          this.#sectionMap.delete(outId);
        }
      }
    });

    const sendLastSection = () => {
      const lastSections = Array.from(this.#sectionMap.values());
      lastSections.forEach((section) => {
        const duration = Date.now() - section.start;
        const scrollDepth = section.maxScrollDepth - section.minScrollDepth;
        const selector = section.selector;
        const event = {
          event: "section_view",
          section: selector,
          view_time: duration,
          scroll_depth: scrollDepth,
        };
        this.#_sendInternalGAEvent(event);
      });
    };

    // have to bind this to the instance of the class because the function is called by window.
    window.addEventListener("beforeunload", sendLastSection.bind(this));
  }

  #_initScrollDepthTracking() {
    if (typeof window === "undefined") return;

    /**
     *
     * @param {SectionTrackedData} section
     */
    const handleElementScroll = (section: SectionTrackedData) => {
      const element = section.element;
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const selector = section.element.getAttribute(
        "data-internal-view-selector"
      );
      if (!selector) return;

      // Calculate how much of the element is visible
      const elementTop = rect.top;
      const elementBottom = rect.bottom;
      const elementHeight = rect.height;

      const visibleTop = Math.max(0, -elementTop);
      const ratioTop = +((visibleTop / elementHeight) * 100).toFixed(2);

      // If element is above viewport, calculate based on scroll position
      let visibleRatio = 0;

      if (elementBottom < 0) {
        // Element is completely above viewport - scrolled past
        visibleRatio = 0;
      } else if (elementTop > viewportHeight) {
        // Element is completely below viewport - not reached yet
        visibleRatio = 0;
      } else {
        // Element is in or partially in viewport
        const visibleBottom = Math.min(
          elementHeight,
          viewportHeight - elementTop
        );
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        visibleRatio =
          elementHeight > 0
            ? Math.round((visibleHeight / elementHeight) * 100)
            : 0;
      }

      const depth = Math.min(ratioTop + visibleRatio, 100);



      section.minScrollDepth = Math.min(section.minScrollDepth, ratioTop);
      section.maxScrollDepth = Math.max(section.maxScrollDepth, depth);
      const now = Date.now();
      const duration = now - section.start;
      const sectionView = section.maxScrollDepth - section.minScrollDepth;
      const settings = this.#selectorVisibilityMap.get(selector) ?? [];
      const sentEventIds = section._sentEventIds ?? [];
      for (const setting of settings) {
        const settingId = setting.id;
        if (sentEventIds.includes(settingId)) continue;
        if (sectionView < setting.scrollDepth) continue;
        if (duration < setting.viewTime) continue;
        const event = setting.customEvent
          ? setting.customEvent
          : `view_${setting.section}`;
        const payload = {
          event: event,
          section: setting.section,
          view_time: duration,
          scroll_depth: sectionView,
        };
        this.#_sendInternalGAEvent(payload);
        section._sentEventIds = [...sentEventIds, settingId];
        this.#sectionMap.set(section.id, section);
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          // const elements = document.querySelectorAll(
          //   "[data-track-scroll-depth]"
          // );
          const sections = Array.from(this.#sectionMap.values());

          sections.forEach((section) => {
            handleElementScroll(section);
          });
        });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  #_initVisibilityTracking() {
    if (this.#isVisibilityTrackingInitialized) return;
    this.#_initSectionVisibilityTracking();
    this.#_initScrollDepthTracking();
    this.#isVisibilityTrackingInitialized = true;
  }

  #_sendInternalGAEvent(...args: any[]) {
    // Explicitly annotate window as any to avoid TypeScript complaints about dataLayer
    (window as any).dataLayer = Array.isArray((window as any).dataLayer)
      ? (window as any).dataLayer
      : [];
    (window as any).dataLayer.push(...args);
  }

  #_readCookie(name: string) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()!.split(";").shift();
    return null;
  }

  #_writeCookie(name: string, value: string, options: Partial<CookieOptions>) {
    const defaultExpires = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const expiryDate = new Date(
      options.expires ? options.expires : defaultExpires
    );
    const expires = `expires=${expiryDate.toUTCString()}`;
    const path = options.path ? options.path : "/";
    const domain = options.domain ? options.domain : window.location.hostname;
    const sameSite = options.sameSite ? options.sameSite : "lax";
    document.cookie = `${name}=${value}; ${expires}; path=${path}; domain=${domain}; sameSite=${sameSite}`;
  }

  #_trackSectionView(section: HTMLElement, seletionString: string) {
    section.setAttribute("data-internal-view-selector", seletionString);
    this.#sectionObserver.observe(section);
  }

  #_claim(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  dropSectionVisibility(id: string) {
    const settings = this.#sectionVisibility.get(id);
    if (!settings) return;
    const selector = settings.selector;
    this.#sectionVisibility.delete(id);
    const oldSelectorSettings = this.#selectorVisibilityMap.get(selector);
    if (!oldSelectorSettings || oldSelectorSettings.length <= 0) return;
    const newSelectorSettings = oldSelectorSettings.filter((s) => s.id !== id);
    this.#selectorVisibilityMap.set(selector, newSelectorSettings);
  }

  addSectionVisibility(
    section: string,
    settings: Partial<SectionVisibilitySettings>
  ) {
    const defaultSelector = `[data-internal-view="${section}"]`;
    const selector = settings.selector || defaultSelector;
    const id = window.crypto.randomUUID();
    const _settings: SectionVisibilitySettings = {
      id: id,
      section: section,
      selector: selector,
      scrollDepth: this.#_claim(settings.scrollDepth || 70, 0, 100),
      viewTime: Math.max(settings.viewTime || 3000, 0),
      customEvent: settings.customEvent || "",
    };
    const selectorSettings = this.#selectorVisibilityMap.get(selector) || [];
    selectorSettings.push(_settings);
    this.#sectionVisibility.set(id, _settings);
    this.#selectorVisibilityMap.set(selector, selectorSettings);
    return id;
  }

  trackUserReturn() {
    const trackingId = this.#trackingId;
    const sessionKey = `__internal_ga_session_${trackingId}__`;
    const lastVisit = this.#_readCookie(sessionKey);
    if (!lastVisit) {
      return false;
    }

    const now = Date.now();
    const diff = now - +lastVisit;
    this.#_sendInternalGAEvent({
      event: "return_visit",
      duration: diff,
    });

    const handleCloseTab = () => {
      const trackingId = this.#trackingId;
      const sessionKey = `__internal_ga_session_${trackingId}__`;
      this.#_writeCookie(sessionKey, Date.now().toString(), {
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
        path: "/",
        domain: window.location.hostname,
        sameSite: "lax",
      });
    };

    window.addEventListener("beforeunload", handleCloseTab.bind(this));
  }

  trackSectionVisibility() {
    this.#_initVisibilityTracking();

    // Get all registered selectors from users
    const getRegisteredSelectors = (): string[] => {
      const selectors = Array.from(this.#selectorVisibilityMap.keys());
      return selectors;
    };

    const observer = new MutationObserver((mutations) => {
      const registeredSelectors = getRegisteredSelectors();

      for (const m of mutations) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const node = m.addedNodes[i];
          if (!(node instanceof HTMLElement)) continue;

          // Check against all registered selectors
          for (const selector of registeredSelectors) {
            // Case 1: the node IS the section
            if (node.matches?.(selector)) {
              this.#_trackSectionView(node, selector);
            }

            // Case 2: the section is inside the added node
            node
              .querySelectorAll?.(selector)
              .forEach((section) =>
                this.#_trackSectionView(section as HTMLElement, selector)
              );
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial scan for all registered selectors
    const initialSelectors = getRegisteredSelectors();
    initialSelectors.forEach((selector) => {
      document
        .querySelectorAll(selector)
        .forEach((section) =>
          this.#_trackSectionView(section as HTMLElement, selector)
        );
    });
  }

  getVersion(): string {
    return this.#version;
  }
}
