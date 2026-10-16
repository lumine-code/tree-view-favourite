const { CompositeDisposable, Emitter } = require("lumine");
describe("Favourite selection availability", () => {
  let main, target, leases, events, snapshot;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("tree-view-favourite")).mainModule;
    target = document.createElement("div");
    target.className = "tree-view";
    lumine.workspace.getElement().appendChild(target);
    leases = new CompositeDisposable();
    events = new Emitter();
    snapshot = { count: 0, paths: [] };
    leases.add(
      main.consumeTreeViewSelection({
        getSelectionSnapshot: () => snapshot,
        onDidChangeSelection: (callback) => events.on("change", callback),
        selectedPaths() {
          throw Error("query materialized selection");
        },
      }),
    );
  });
  afterEach(() => {
    if (jasmine.isSpy(main.store.has)) main.store.has.and.callThrough();
    leases.dispose();
    events.dispose();
    target.remove();
  });
  it("caches selected favourite membership outside predicate queries", () => {
    const has = (id) => lumine.commands.canDispatch(target, "tree-view-favourite:" + id);
    expect(has("add")).toBe(false);
    snapshot = { count: 1, paths: ["/selected/item"] };
    events.emit("change");
    expect(has("add")).toBe(true);
    expect(has("remove")).toBe(false);
    main.store.addEntry("Favourite", "/selected/item");
    main.refreshSelectionAvailability();
    const membership = spyOn(main.store, "has").and.throwError("query scanned favourites");
    expect(has("remove")).toBe(true);
    expect(membership).not.toHaveBeenCalled();
  });
});
