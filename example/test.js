function main() {
    const vnsGaUtil = new window.VnsGaUtil.VnsGaUtil();
    vnsGaUtil.addSectionVisibility("hero", {
        scrollDepth: 50,
        viewTime: 3000,
        customEvent: "hero_view",
    });
    vnsGaUtil.addSectionVisibility("features", {
        scrollDepth: 75,
        viewTime: 5000,
        customEvent: "features_view",
    });
    vnsGaUtil.addSectionVisibility("how-it-works", {
        scrollDepth: 20,
        viewTime: 1000,
        customEvent: "how-it-works_view",
    });
    vnsGaUtil.addSectionVisibility("how-it-works", {
        scrollDepth: 60,
        viewTime: 2000,
        customEvent: "how-it-works_view_2000",
    });
    vnsGaUtil.trackSectionVisibility();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
