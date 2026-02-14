import ts from "typescript";
import type { ParsedSourceFile, SymbolEntry, SymbolKind, SupportedLanguage, UseEntry } from "../types.js";

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers) {
    return false;
  }
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function lineFor(sourceFile: ts.SourceFile, node: ts.Node): number {
  const loc = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return loc.line + 1;
}

function addSymbol(
  symbols: SymbolEntry[],
  sourceFile: ts.SourceFile,
  language: SupportedLanguage,
  path: string,
  kind: SymbolKind,
  name: string,
  node: ts.Node,
  exported: boolean,
): void {
  if (!name.trim()) {
    return;
  }
  symbols.push({
    name,
    kind,
    path,
    line: lineFor(sourceFile, node),
    language,
    exported,
  });
}

export function parseTsOrJsFile(
  filePath: string,
  content: string,
  language: "typescript" | "javascript",
): ParsedSourceFile {
  const scriptKind = language === "typescript"
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const symbols: SymbolEntry[] = [];
  const imports: ParsedSourceFile["imports"] = [];
  const uses: UseEntry[] = [];
  const declarationNodes = new Set<ts.Node>();

  function markDeclaration(node: ts.Node | undefined): void {
    if (!node) {
      return;
    }
    declarationNodes.add(node);
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      markDeclaration(node.name);
      addSymbol(
        symbols,
        sourceFile,
        language,
        filePath,
        "function",
        node.name.text,
        node.name,
        isExported(node),
      );
    } else if (ts.isClassDeclaration(node) && node.name) {
      markDeclaration(node.name);
      addSymbol(
        symbols,
        sourceFile,
        language,
        filePath,
        "class",
        node.name.text,
        node.name,
        isExported(node),
      );
    } else if (ts.isInterfaceDeclaration(node)) {
      markDeclaration(node.name);
      addSymbol(
        symbols,
        sourceFile,
        language,
        filePath,
        "interface",
        node.name.text,
        node.name,
        isExported(node),
      );
    } else if (ts.isTypeAliasDeclaration(node)) {
      markDeclaration(node.name);
      addSymbol(
        symbols,
        sourceFile,
        language,
        filePath,
        "type",
        node.name.text,
        node.name,
        isExported(node),
      );
    } else if (ts.isEnumDeclaration(node)) {
      markDeclaration(node.name);
      addSymbol(
        symbols,
        sourceFile,
        language,
        filePath,
        "enum",
        node.name.text,
        node.name,
        isExported(node),
      );
    } else if (ts.isVariableStatement(node)) {
      const exported = isExported(node);
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          markDeclaration(declaration.name);
          addSymbol(
            symbols,
            sourceFile,
            language,
            filePath,
            "variable",
            declaration.name.text,
            declaration.name,
            exported,
          );
        }
      }
    } else if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      const source = ts.isStringLiteral(moduleSpecifier)
        ? moduleSpecifier.text
        : moduleSpecifier.getText(sourceFile);

      const imported: string[] = [];
      const clause = node.importClause;
      if (clause?.name) {
        imported.push(clause.name.text);
        markDeclaration(clause.name);
      }
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          imported.push(`* as ${clause.namedBindings.name.text}`);
          markDeclaration(clause.namedBindings.name);
        } else if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;
            imported.push(importedName);
            markDeclaration(element.name);
          }
        }
      }

      imports.push({
        path: filePath,
        line: lineFor(sourceFile, node),
        language,
        source,
        imported,
      });
    } else if (ts.isIdentifier(node)) {
      if (!declarationNodes.has(node)) {
        uses.push({
          name: node.text,
          path: filePath,
          line: lineFor(sourceFile, node),
          language,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { symbols, imports, uses };
}
