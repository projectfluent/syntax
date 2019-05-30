import * as ast from "./ast";
import {IValue, StringValue} from "./value";
import {IResult, Success, Failure} from "./result";

export class Scope {
    private readonly variables: Map<string, IValue>;
    public errors: Array<string>;

    constructor(variables: Map<string, IValue>) {
        this.variables = variables;
        this.errors = [];
    }

    resolve(node: ast.ISyntaxNode): IResult<IValue> {
        switch (node.type) {
            case ast.SyntaxNode.VariableReference:
                return this.resolveVariableReference(node as ast.IVariableReference);
            case ast.SyntaxNode.TextElement:
                return this.resolveTextElement(node as ast.ITextElement);
            case ast.SyntaxNode.Placeable:
                return this.resolvePlaceable(node as ast.IPlaceable);
            case ast.SyntaxNode.Pattern:
                return this.resolvePattern(node as ast.IPattern);
            default:
                throw new TypeError("Unresolvable node type.");
        }
    }

    resolveVariableReference(node: ast.IVariableReference): IResult<IValue> {
        let value = this.variables.get(node.id.name);
        if (value !== undefined) {
            return new Success(value);
        } else {
            this.errors.push("Missing variable");
            return new Failure(new StringValue(`$${node.id.name}`));
        }
    }

    resolveTextElement(node: ast.ITextElement): IResult<IValue> {
        return new Success(new StringValue(node.value));
    }

    resolvePlaceable(node: ast.IPlaceable): IResult<IValue> {
        return this.resolve(node.expression);
    }

    resolvePattern(node: ast.IPattern): IResult<IValue> {
        return new Success(
            new StringValue(
                node.elements
                    .map(element =>
                        this.resolve(element)
                            .fold(value => value, value => new StringValue(`{${value.value}}`))
                            .format(this)
                    )
                    .join("")
            )
        );
    }
}
