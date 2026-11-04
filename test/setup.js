import { vi } from "vitest";

// no mu-javascript-template and no triplestore in the tests
vi.mock("mu", () => ({ sparqlEscapeUri: (uri) => `<${uri}>` }));
vi.mock("@lblod/mu-auth-sudo", () => ({ querySudo: vi.fn(), updateSudo: vi.fn() }));
