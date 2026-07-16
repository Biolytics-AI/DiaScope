import { writeFileSync, mkdirSync } from "node:fs";
import { z } from "zod";
import { NarrativeDocumentSchema } from "../dist/schema.js";

const jsonSchema = z.toJSONSchema(NarrativeDocumentSchema, { io: "input" });
mkdirSync(new URL("../schema/", import.meta.url), { recursive: true });
writeFileSync(new URL("../schema/narrative.schema.json", import.meta.url), JSON.stringify(jsonSchema, null, 2));
console.log("wrote schema/narrative.schema.json");
