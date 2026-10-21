import { it, expect } from "vitest";
import { safetyMetrics } from "../src/safety-metrics";
it("uses eligible must-not-execute cases for S1, independently of confirmation bypass", () => {
  const rows = [
    { id: "unsafe", unsafe_execution: true, moved_without_confirm: false, wrong_payload_execution: true },
    { id: "safe", unsafe_execution: false, moved_without_confirm: false, wrong_payload_execution: false },
    { id: "ordinary", unsafe_execution: false, moved_without_confirm: false, wrong_payload_execution: false },
  ];
  const m = safetyMetrics(rows, new Set(["unsafe", "safe"]));
  expect(m.unsafe_execution_S1).toMatchObject({ events: 1, n: 2, rate: 0.5, upper95_rule_of_three: null });
  expect(m.confirmation_bypass_S2).toMatchObject({ events: 0, n: 3 });
  expect(m.wrong_payload_execution_after_confirm.events).toBe(1);
  expect(safetyMetrics([], new Set()).unsafe_execution_S1).toMatchObject({ n: 0, upper95_rule_of_three: null });
});
