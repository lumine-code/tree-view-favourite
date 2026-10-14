// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: ["language-javascript", "tree-view"],
  viewport: { width: 1200, height: 760 },
  async before({ profile, fixture }) {
    require("node:fs").writeFileSync(
      require("node:path").join(profile, "favourite.json"),
      JSON.stringify({
        "Quick access": [fixture("Signal Lab/README.md"), fixture("Signal Lab/data")],
      }),
    );
  },
  async prepare(context) {
    const { lumine, state, fixture, open } = context;
    state.editor = await open("Signal Lab/src/signal.js");
    await lumine.project.setPaths([fixture("Signal Lab")]);
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Pin frequently used files and folders above the project tree.",
      timeout: 60000,
      async run(context) {
        const { lumine, state } = context;
        {
          lumine.commands.dispatch(lumine.views.getView(state.editor), "tree-view:show");
        }
      },
      ready() {
        return Boolean(document.querySelector(".tree-view")?.innerText.includes("Quick access"));
      },
    },
  ],
  async cleanup() {},
};
