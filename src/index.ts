import fs = require('fs');
import path = require('path');
import * as ts from 'typescript';

const inputFileName = 'C:/github/typescript/src/compiler/tsconfig.json';
// const inputFileName = 'C:/github/project-references-outfile/cli/tsconfig.json';

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

run();

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

function shortName(fileName: string) {
    return path.relative(path.dirname(inputFileName), fileName);
}

function emitFileGraph(sourceFile: ts.SourceFile) {
    const name = shortName(sourceFile.fileName);
    const lines: string[] = [];
    const seenSymbols = new Map<ts.Symbol, boolean>();
    const dependencies = new Map<string, string[]>();

    lines.push(`    "${name}" [shape=rect]`);
    ts.forEachChild(sourceFile, walk);

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

