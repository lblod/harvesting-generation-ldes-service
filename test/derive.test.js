import { readFile } from "fs/promises";
import { querySudo } from "@lblod/mu-auth-sudo";
import { enrichBesluiten } from "../lib/derive";
import { expectSameTurtle, storeToTurtle, turtleToStore } from "./helpers";

const BESLUIT = "http://ex.org/besluit/1";
const ORGAN = { type: "uri", value: "http://ex.org/orgaan-in-tijd/1" };
const GENERAL_ORGAN = { type: "uri", value: "http://ex.org/orgaan/1" };
const date = (value) => ({ type: "literal", value });

// The zitting of the besluit, as the triplestore answers.
const meeting = (...rows) =>
  rows.map((row) => ({ besluit: { type: "uri", value: BESLUIT }, organ: ORGAN, ...row }));

const CASES = [
  ["01", "passed_by, earliest date and language are derived", meeting(
    { generalOrgan: GENERAL_ORGAN, date: date("2025-03-01") },
    { generalOrgan: GENERAL_ORGAN, date: date("2025-03-10") },
  )],
  ["02", "passed_by of the bestuursorgaan is replaced by the organ in tijd", meeting(
    { generalOrgan: GENERAL_ORGAN },
  )],
  ["03", "another passed_by is kept", meeting({ generalOrgan: GENERAL_ORGAN })],
  ["04", "existing date and language are kept", meeting({ date: date("2025-03-01") })],
  ["05", "without zitting only the language is added", []],
  ["06", "the date of a dateTime", meeting({ date: date("2025-03-04T10:00:00Z") })],
];

describe("enrichBesluiten", () => {
  test.each(CASES.map(([name, description, bindings]) => ({ name, description, bindings })))(
    "$name: $description",
    async ({ name, bindings }) => {
      querySudo.mockResolvedValue({ results: { bindings } });
      const store = turtleToStore(await readFile(`test/examples/derive/input/${name}.ttl`, "utf-8"));

      await enrichBesluiten(new Map([[BESLUIT, store]]));

      expectSameTurtle(
        await storeToTurtle(store),
        await readFile(`test/examples/derive/output/${name}.ttl`, "utf-8"),
      );
    },
  );

  test("asks the zitting of all besluiten at once", async () => {
    querySudo.mockResolvedValue({ results: { bindings: [] } });

    await enrichBesluiten(new Map([[BESLUIT, turtleToStore("")]]));

    expect(querySudo).toHaveBeenCalledTimes(1);
    expect(querySudo.mock.calls[0][0]).toContain(`VALUES ?besluit { <${BESLUIT}> }`);
  });
});
