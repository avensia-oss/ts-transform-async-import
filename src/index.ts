import * as ts from 'typescript';

export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  if (!program) {
    throw new Error('No ts.Program was passed to the transformer factory');
  }
  return (context: ts.TransformationContext) => (file: ts.SourceFile) => visitSourceFile(file, program, context);
}

type ImportedAsyncFunction = { name: string; propertyName: string | null; module: string };

function visitSourceFile(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
): ts.SourceFile {
  const imports = sourceFile.statements.filter(
    s => s.kind === ts.SyntaxKind.ImportDeclaration,
  ) as ts.ImportDeclaration[];
  const typeChecker = program.getTypeChecker();
  const asyncImportedFunctions = flatMap<ImportedAsyncFunction>(
    imports.map(i => {
      if (i.importClause) {
        const namedImports = i.importClause.namedBindings as ts.NamedImports;
        if (namedImports.elements) {
          return namedImports.elements.map(e => {
            const type = typeChecker.getTypeAtLocation(e);
            const callSignatures = type.getCallSignatures();
            if (callSignatures.length) {
              const callSignature = callSignatures[0];
              const returnType = typeChecker.getReturnTypeOfSignature(callSignature).getSymbol();
              if (returnType && returnType.escapedName === 'Promise') {
                return {
                  propertyName: e.propertyName ? e.propertyName.escapedText.toString() : null,
                  name: e.name.escapedText.toString(),
                  module: (i.moduleSpecifier as ts.StringLiteral).text,
                };
              }
            }
            return null;
          });
        }
      }
      return null;
    }),
  );
  console.log(asyncImportedFunctions);
  if (asyncImportedFunctions.length) {
    const otherwiseUsedAsyncImportedFunctions: string[] = [];
    const transformedSourceFile = ts.visitEachChild(
      visitNode(sourceFile, asyncImportedFunctions, otherwiseUsedAsyncImportedFunctions, program),
      childNode =>
        visitNodeAndChildren(childNode, asyncImportedFunctions, otherwiseUsedAsyncImportedFunctions, program, context),
      context,
    );

    if (otherwiseUsedAsyncImportedFunctions.length === asyncImportedFunctions.length) {
      return transformedSourceFile;
    } else {
      const importsToRemove = asyncImportedFunctions.filter(
        a => otherwiseUsedAsyncImportedFunctions.indexOf(a.name) === -1,
      );

      return ts.visitEachChild(
        transformedSourceFile,
        childNode => {
          if (childNode.kind === ts.SyntaxKind.ImportDeclaration) {
            const importDecl = childNode as ts.ImportDeclaration;
            const importNamesToRemoveForThisImport = importsToRemove
              .filter(i => i.module === (importDecl.moduleSpecifier as ts.StringLiteral).text)
              .map(i => i.name);

            if (
              importNamesToRemoveForThisImport.length &&
              importDecl.importClause &&
              importDecl.importClause.namedBindings
            ) {
              const namedImports = importDecl.importClause.namedBindings as ts.NamedImports;
              if (namedImports.elements) {
                const shouldBeRemoved = (e: ts.ImportSpecifier) => {
                  return importNamesToRemoveForThisImport.indexOf(e.name.escapedText.toString()) !== -1;
                };
                if (namedImports.elements.every(shouldBeRemoved)) {
                  return [];
                } else {
                  return ts.createImportDeclaration(
                    importDecl.decorators,
                    importDecl.modifiers,
                    ts.createImportClause(
                      importDecl.importClause.name,
                      removeImportNames(namedImports, importNamesToRemoveForThisImport),
                    ),
                    importDecl.moduleSpecifier,
                  );
                }
              }
            }
          }
          return childNode;
        },
        context,
      );
    }
  } else {
    return sourceFile;
  }
}

function removeImportNames(namedBindings: ts.NamedImports, importNamesToRemove: string[]): ts.NamedImports {
  return {
    ...namedBindings,
    elements: (namedBindings.elements.filter(
      e => importNamesToRemove.indexOf(e.name.text) === -1,
    ) as any) as ts.NodeArray<ts.ImportSpecifier>,
  };
}

function flatMap<T>(arr: (T | null | undefined | (T | null | undefined)[])[]): T[] {
  const flattened: T[] = [];
  for (const t of arr) {
    if (t) {
      if (Array.isArray(t)) {
        flattened.push(...(t.filter(x => !!x) as T[]));
      } else {
        flattened.push(t);
      }
    }
  }
  return flattened;
}

function visitNodeAndChildren(
  node: ts.Node,
  asyncImportedFunctions: ImportedAsyncFunction[],
  otherwiseUsedAsyncImportedFunctions: string[],
  program: ts.Program,
  context: ts.TransformationContext,
): ts.Node | ts.Node[];
function visitNodeAndChildren(
  node: ts.Node,
  asyncImportedFunctions: ImportedAsyncFunction[],
  otherwiseUsedAsyncImportedFunctions: string[],
  program: ts.Program,
  context: ts.TransformationContext,
): ts.Node | ts.Node[] {
  return ts.visitEachChild(
    visitNode(node, asyncImportedFunctions, otherwiseUsedAsyncImportedFunctions, program),
    childNode =>
      visitNodeAndChildren(childNode, asyncImportedFunctions, otherwiseUsedAsyncImportedFunctions, program, context),
    context,
  );
}

function visitNode(
  node: ts.Node,
  asyncImportedFunctions: ImportedAsyncFunction[],
  otherwiseUsedAsyncImportedFunctions: string[],
  program: ts.Program,
): any /* TODO */ {
  const typeChecker = program.getTypeChecker();
  if (node.kind === ts.SyntaxKind.CallExpression) {
    const callExpr = node as ts.CallExpression;
    if (callExpr.expression.kind === ts.SyntaxKind.Identifier) {
      const identifier = callExpr.expression as ts.Identifier;
      const asyncImportedFunction = asyncImportedFunctions.find(a => a.name === identifier.escapedText.toString());
      if (asyncImportedFunction) {
        return ts.createCall(
          ts.createPropertyAccess(
            ts.createCall(ts.createIdentifier('import'), undefined, [
              ts.createStringLiteral(asyncImportedFunction.module),
            ]),
            'then',
          ),
          undefined,
          [
            ts.createArrowFunction(
              undefined,
              undefined,
              [ts.createParameter(undefined, undefined, undefined, 'm', undefined, undefined, undefined)],
              undefined,
              undefined,
              ts.createCall(
                ts.createPropertyAccess(
                  ts.createIdentifier('m'),
                  asyncImportedFunction.propertyName || asyncImportedFunction.name,
                ),
                undefined,
                callExpr.arguments,
              ),
            ),
          ],
        );
      }
    }
  } else if (node.kind === ts.SyntaxKind.Identifier) {
    const identifier = node as ts.Identifier;
    if (
      identifier.parent &&
      identifier.parent.kind !== ts.SyntaxKind.ImportSpecifier &&
      identifier.parent.kind !== ts.SyntaxKind.Parameter
    ) {
      if (asyncImportedFunctions.some(a => (a.propertyName || a.name) === identifier.text)) {
        // TODO: This is a bit naive since a child scope can create a shadow declaration of a variable
        // with the same name
        otherwiseUsedAsyncImportedFunctions.push(identifier.text);
      }
    }
    return node;
  } else if (node.kind === ts.SyntaxKind.ImportDeclaration) {
    const importDecl = node as ts.ImportDeclaration;
  }
  return node;
}
