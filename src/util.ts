import * as ts from "typescript";

const PRIVATE_MODIFIERS = [
    ts.SyntaxKind.PrivateKeyword,
    ts.SyntaxKind.PrivateIdentifier,
];

/**
 * Return the unique identifier for a type.
 * It the type expression as rendered by the `TypeChecker` plus
 * path to the file, line, and column number for type declaration.
 */
export function typeId(tc: ts.TypeChecker, type: ts.Type): string {
    const typeDecl = type.symbol.declarations?.[0];
    const suffix = typeDecl == null ? "" : ` at ${abosolutePos(typeDecl)}`;

    return `${tc.typeToString(type)}${suffix}`;
}

function abosolutePos(node: ts.Node): string {
    const file = node.getSourceFile();
    const pos = file.getLineAndCharacterOfPosition(node.getStart());

    return `${file.fileName}:${pos.line + 1}:${pos.character + 1}`;
}

export function isPrivate(decl: ts.Declaration): boolean {
    return !!decl.modifiers?.some((modifier) =>
        PRIVATE_MODIFIERS.includes(modifier.kind)
    );
}
