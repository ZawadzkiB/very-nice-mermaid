import { describe, expect, it } from "vitest";
import { readClassModel } from "../src/native/class/read.js";

// Spinning up jsdom + mermaid is heavy on first import.
const T = 30_000;

describe("readClassModel (SVG → model, FR2/D3)", () => {
  it(
    "recovers classes with stereotype, visibility-tagged members/methods",
    async () => {
      const model = await readClassModel(
        [
          "classDiagram",
          "  class Animal {",
          "    <<abstract>>",
          "    +String name",
          "    #int age",
          "    -secret",
          "    +makeSound() void",
          "  }",
          "  class Dog",
        ].join("\n"),
      );

      expect(model.kind).toBe("class");
      const animal = model.classes.find((c) => c.id === "Animal")!;
      expect(animal.name).toBe("Animal");
      expect(animal.stereotype).toBe("abstract");
      expect(animal.members).toEqual([
        { visibility: "+", text: "String name" },
        { visibility: "#", text: "int age" },
        { visibility: "-", text: "secret" },
      ]);
      expect(animal.methods).toEqual([{ visibility: "+", text: "makeSound() : void" }]);

      const dog = model.classes.find((c) => c.id === "Dog")!;
      expect(dog.members).toEqual([]);
      expect(dog.methods).toEqual([]);
    },
    T,
  );

  it(
    "recovers every relation type with the correct (from, to, head) and label",
    async () => {
      const model = await readClassModel(
        [
          "classDiagram",
          "  Animal <|-- Dog : extends",
          "  Dog *-- Collar : has",
          "  Owner o-- Dog : owns",
          "  Dog --> Vet : visits",
          "  Dog ..> Vaccine : uses",
          "  Dog ..|> Pet : realizes",
        ].join("\n"),
      );

      // Every relation should recover cleanly (no diagnostics).
      expect(model.warnings).toEqual([]);
      const byPair = (from: string, to: string) =>
        model.relations.find((r) => r.from === from && r.to === to)!;

      expect(byPair("Animal", "Dog")).toMatchObject({ type: "inheritance", head: "from", label: "extends" });
      expect(byPair("Dog", "Collar")).toMatchObject({ type: "composition", head: "from", label: "has" });
      expect(byPair("Owner", "Dog")).toMatchObject({ type: "aggregation", head: "from", label: "owns" });
      expect(byPair("Dog", "Vet")).toMatchObject({ type: "association", head: "to", label: "visits" });
      expect(byPair("Dog", "Vaccine")).toMatchObject({ type: "dependency", head: "to", label: "uses" });
      expect(byPair("Dog", "Pet")).toMatchObject({ type: "realization", head: "to", label: "realizes" });
    },
    T,
  );

  it(
    "recovers relation endpoints even when class names contain underscores",
    async () => {
      const model = await readClassModel(
        ["classDiagram", "  Order <|-- Order_Item", "  Order --> Line_Item : has"].join("\n"),
      );
      expect(model.classes.map((c) => c.id).sort()).toEqual(["Line_Item", "Order", "Order_Item"]);
      expect(model.relations.find((r) => r.to === "Order_Item")).toMatchObject({
        from: "Order",
        type: "inheritance",
      });
      expect(model.relations.find((r) => r.to === "Line_Item")).toMatchObject({
        from: "Order",
        type: "association",
        label: "has",
      });
    },
    T,
  );
});
