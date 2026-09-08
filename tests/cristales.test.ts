import { describe, expect, it } from "vitest";
import { dpParaPedido } from "../src/lib/cristales";

describe("dpParaPedido", () => {
  it("resta 2 mm a la DP de cerca en pedidos de stock", () => {
    expect(dpParaPedido(66, "cerca", "stock")).toBe(64);
  });

  it("mantiene la DP de lejos en pedidos de stock", () => {
    expect(dpParaPedido(66, "lejos", "stock")).toBe(66);
  });

  it("mantiene la DP original en pedidos de laboratorio", () => {
    expect(dpParaPedido(66, "cerca", "laboratorio")).toBe(66);
  });

  it("mantiene la ausencia de DP", () => {
    expect(dpParaPedido(null, "cerca", "stock")).toBeNull();
  });
});

