import fs = require('fs');
import path = require('path');
import * as ts from 'typescript';

// const inputFileName = 'C:/github/typescript/src/services/tsconfig.json';
const inputFileName = 'C:/github/typescript/src/compiler/tsconfig.json';

const configFile = ts.readJsonConfigFile(inputFileName, ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.jsonObject, ts.sys, path.dirname(inputFileName));

const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();
const languageService = ts.createLanguageService({
    getCurrentDirectory() { return ""; },
    getScriptFileNames() {
        return program.getRootFileNames().slice();
    },
    getScriptSnapshot(fileName) {
        return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, { encoding: 'utf-8' }));
    },
    getScriptVersion() {
        return "";
    },
    getDefaultLibFileName(options) {
        return ts.getDefaultLibFilePath(options);
    },
    getCompilationSettings() {
        return program.getCompilerOptions();
    }
});
program.emit();

run2();

function run() {
    const lines: string[] = [];
    lines.push(`digraph ${path.basename(path.dirname(inputFileName))} {`);
    for (const sourceFile of program.getSourceFiles()) {
        if (!sourceFile.fileName.endsWith('core.ts')) continue;
        if (sourceFile.isDeclarationFile) continue;
        const subLines = emitFileGraph(sourceFile);
        for(const s of subLines) lines.push(s);
    }
    lines.push(`}`);
    console.log(lines.join("\r\n"));
}

function run2() {
    const lines: string[] = [];
    const files = program.getSourceFiles().slice();
    const getLinksCached = cache(getOutboundLinks);
    files.sort((a, b) => {
        const aLinks = getLinksCached(a.fileName, a);
        const bLinks = getLinksCached(b.fileName, b);
        return aLinks.size - bLinks.size;
    });
    for (const file of files) {
        const links = getOutboundLinks(file);
        lines.push(`File ${file.fileName} has ${links.size} dependencies`);
        links.forEach((value, key) => {
            lines.push(` * ${key}: ${truncate(value.join(", "), 70)}`);
        });
    }
    console.log(lines.join("\r\n"));
}

function cache<T, U>(func: (arg: T) => U): (key: string, arg: T) => U {
    const lookup = Object.create(null);
    return function(key, arg) {
        if (key in lookup) return lookup[key];
        return lookup[key] = func(arg);
    }
}

function truncate(s: string, n: number) {
    if (s.length <= n) return s;
    return s.substr(0, n - 3) + "...";
}

function shortName(fileName: string) {
    return path.relative(path.dirname(inputFileName), fileName);
}

function getOutboundLinks(sourceFile: ts.SourceFile) {
    const seenSymbols = new Map<ts.Symbol, boolean>();
    // Map from fileName to named symbol dependencies
    const dependencies = new Map<string, string[]>();

    walk(sourceFile);
    return dependencies;

    function walk(node: ts.Node) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol && !seenSymbols.has(symbol)) {
            seenSymbols.set(symbol, true);
            if (symbol.declarations) {
                if (symbol.declarations.length < 2) {
                    for (const decl of symbol.declarations) {
                        const file = decl.getSourceFile();
                        if (file !== sourceFile && !file.isDeclarationFile) {
                            if (!dependencies.has(file.fileName)) {
                                dependencies.set(file.fileName, []);
                            }
                            dependencies.get(file.fileName)!.push(symbol.name);
                        }
                    }
                }
            }
        }
    
        // Don't recurse into certain syntax kinds
        switch(node.kind) {
            // We don't want to visit e.g. "ts." because that will yield false positives from all files to all files
            case ts.SyntaxKind.PropertyAccessExpression:
            case ts.SyntaxKind.QualifiedName:
                return;
    
            default:
                ts.forEachChild(node, walk);        
        }
    }

}

function emitFileGraph(sourceFile: ts.SourceFile) {
    const name = shortName(sourceFile.fileName);
    const lines: string[] = [];
    const dependencies = getOutboundLinks(sourceFile);
    lines.push(`    "${name}" [shape=rect]`);
    dependencies.forEach((deps, fileName) => {
        let label: string
        if (deps.length > 5) {
            label = `(${deps.length})`;
        } else {
            label = deps.join(", ");
        }
        lines.push(`    "${name}" -> "${shortName(fileName)}" [label="${label}"]`);
    });
    return lines;
}

