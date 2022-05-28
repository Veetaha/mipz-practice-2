import * as ts from "typescript";
import * as path from "path";
import * as metrics from "./metrics";
import * as fs from "fs";

const libraryRoot = process.argv[2];

if (libraryRoot === undefined) {
    throw new Error("Expected library path argument, but none was specified");
}

const tsconfigPath = path.join(path.parse(libraryRoot).dir, "tsconfig.json");
let tsconfig = {};

try {
    tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
} catch {
    console.warn("Cloud not load tsconfig, using default config...");
}

const program = ts.createProgram({
    rootNames: [libraryRoot],
    options: tsconfig,
});

const tc = program.getTypeChecker();

const libFiles = program
    .getSourceFiles()
    .filter((file) => !path.parse(file.fileName).dir.includes("node_modules"));

console.log(JSON.stringify(metrics.aggregate(tc, libFiles), null, 4));
