import * as FTL from "./ast.mjs";
import {list_into, into} from "./abstract.mjs";
import {
    always, and, charset, defer, either, eof, maybe, not,
    regex, repeat, repeat1, sequence, string
} from "../lib/combinators.mjs";
import {
    element_at, flatten, join, keep_abstract, mutate, print
} from "../lib/mappers.mjs";

/* ----------------------------------------------------- */
/* An FTL file defines a Resource consisting of Entries. */
export
let Resource = defer(() =>
    repeat(
        either(
            Entry,
            blank_block,
            junk_line))
    .chain(list_into(FTL.Resource)));

/* ------------------------------------------------------------------------- */
/* Entries are the main building blocks of Fluent. They define translations and
 * contextual and semantic information about the translations. During the AST
 * construction, adjacent comment lines of the same comment type (defined by
 * the number of #) are joined together. Single-# comments directly preceding
 * Messages and Terms are attached to the Message or Term and are not
 * standalone Entries. */
export
let Entry = defer(() =>
    either(
        Message,
        Term,
        CommentLine));

let Message = defer(() =>
    sequence(
        Identifier.abstract,
        maybe(blank_inline),
        string("="),
        either(
            sequence(
                Pattern.abstract,
                repeat(Attribute).abstract),
            sequence(
                always(null).abstract,
                repeat1(Attribute).abstract)))
    .map(flatten(1))
    .map(keep_abstract)
    .chain(list_into(FTL.Message)));

let Term = defer(() =>
    sequence(
        TermIdentifier.abstract,
        maybe(blank_inline),
        string("="),
        Value.abstract,
        repeat(Attribute).abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.Term)));

/* -------------------------------------------------------------------------- */
/* Adjacent comment lines of the same comment type are joined together during
 * the AST construction. */
let CommentLine = defer(() =>
    sequence(
        either(
            string("###"),
            string("##"),
            string("#")).abstract,
        maybe(
            sequence(
                string(" "),
                regex(/.*/).abstract)),
        line_end)
    .map(flatten(1))
    .map(keep_abstract)
    .chain(list_into(FTL.Comment)));

/* ------------------------------------------------------------------------- */
/* Adjacent junk_lines are joined into FTL.Junk during the AST construction. */
let junk_line = defer(() =>
    sequence(
        regex(/.*/),
        line_end)
    .map(join)
    .chain(into(FTL.Junk)));

/* --------------------------------- */
/* Attributes of Messages and Terms. */
let Attribute = defer(() =>
    sequence(
        maybe(blank),
        string("."),
        Identifier.abstract,
        maybe(blank_inline),
        string("="),
        Pattern.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.Attribute)));

/* ------------------------------------- */
/* Value types: Pattern and VariantList. */
let Value = defer(() =>
    either(
        VariantList,
        Pattern));

let VariantList = defer(() =>
    sequence(
        maybe(blank),
        string("{"),
        variant_list.abstract,
        maybe(blank),
        string("}"))
    .map(keep_abstract)
    .chain(list_into(FTL.VariantList)));

let Pattern = defer(() =>
    either(
        sequence(
            PatternInline,
            PatternBlock).map(flatten(1)),
        PatternInline,
        PatternBlock)
    .chain(list_into(FTL.Pattern)));

let PatternInline = defer(() =>
    sequence(
        maybe(blank_inline),
        repeat1(PatternElement.abstract),
        line_end.chain(into(FTL.TextElement)).abstract)
    .map(flatten(1))
    .map(keep_abstract));

let PatternBlock = defer(() =>
    sequence(
        repeat(blank_block),
        pattern_line.abstract,
        repeat(
            either(
                pattern_line,
                blank_block.chain(into(FTL.TextElement))).abstract))
    .map(flatten(1))
    .map(keep_abstract)
    .map(flatten(1)));

let pattern_line = defer(() =>
    sequence(
        PatternStartElement,
        repeat(PatternElement),
        line_end.chain(into(FTL.TextElement)))
    .map(flatten(1)));

let PatternElement = defer(() =>
    either(
        TextElement,
        Placeable));

let PatternStartElement = defer(() =>
    either(
        sequence(
            blank_inline,
            text_start.chain(into(FTL.TextElement))),
        sequence(
            maybe(blank_inline),
            Placeable))
    .map(element_at(1)));

let TextElement = defer(() =>
    repeat1(
        text_char)
    .map(join)
    .chain(into(FTL.TextElement)));

let Placeable = defer(() =>
    sequence(
        string("{"),
        maybe(blank),
        either(
            // Order matters!
            SelectExpression,
            InlineExpression),
        maybe(blank),
        string("}"))
    .map(element_at(2))
    .chain(into(FTL.Placeable)));

/* ------------------------------------------------------------------- */
/* Rules for validating expressions in Placeables and as selectors of
 * SelectExpressions are documented in spec/valid.md and enforced in
 * syntax/abstract.mjs. */
let InlineExpression = defer(() =>
    either(
        StringLiteral,
        NumberLiteral,
        VariableReference,
        CallExpression, // Must be before MessageReference
        AttributeExpression,
        VariantExpression,
        MessageReference,
        TermReference,
        Placeable));

/* -------- */
/* Literals */
let StringLiteral = defer(() =>
    sequence(
        quote,
        repeat(quoted_text_char),
        quote)
    .map(element_at(1))
    .map(join)
    .chain(into(FTL.StringLiteral)));

let NumberLiteral = defer(() =>
    sequence(
        maybe(string("-")),
        repeat1(digit),
        maybe(
            sequence(
                string("."),
                repeat1(digit))))
    .map(flatten(2))
    .map(join)
    .chain(into(FTL.NumberLiteral)));

/* ------------------ */
/* Inline Expressions */
let MessageReference = defer(() =>
    Identifier.chain(into(FTL.MessageReference)));

let TermReference = defer(() =>
    TermIdentifier.chain(into(FTL.TermReference)));

let VariableReference = defer(() =>
    VariableIdentifier.chain(into(FTL.VariableReference)));

let CallExpression = defer(() =>
    sequence(
        Function.abstract,
        maybe(blank),
        string("("),
        maybe(blank),
        argument_list.abstract,
        maybe(blank),
        string(")"))
    .map(keep_abstract)
    .chain(list_into(FTL.CallExpression)));

let argument_list = defer(() =>
    sequence(
        repeat(
            sequence(
                Argument.abstract,
                maybe(blank),
                string(","),
                maybe(blank))),
        maybe(Argument.abstract))
    .map(flatten(2))
    .map(keep_abstract));

let Argument = defer(() =>
    either(
        NamedArgument,
        InlineExpression));

let NamedArgument = defer(() =>
    sequence(
        Identifier.abstract,
        maybe(blank),
        string(":"),
        maybe(blank),
        either(
            StringLiteral,
            NumberLiteral).abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.NamedArgument)));

let AttributeExpression = defer(() =>
    sequence(
        either(
            MessageReference,
            TermReference).abstract,
        string("."),
        Identifier.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.AttributeExpression)));

let VariantExpression = defer(() =>
    sequence(
        TermReference.abstract,
        VariantKey.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.VariantExpression)));

/* ----------------- */
/* Block Expressions */
let SelectExpression = defer(() =>
    sequence(
        InlineExpression.abstract,
        maybe(blank),
        string("->"),
        variant_list.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.SelectExpression)));

let variant_list = defer(() =>
    sequence(
        blank_block,
        repeat(Variant).abstract,
        DefaultVariant.abstract,
        repeat(Variant).abstract)
    .map(keep_abstract)
    .map(flatten(1)));

let Variant = defer(() =>
    sequence(
        maybe(blank),
        VariantKey.abstract,
        Value.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.Variant)));

let DefaultVariant = defer(() =>
    sequence(
        maybe(blank),
        string("*"),
        VariantKey.abstract,
        Value.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.Variant))
    .map(mutate({default: true})));

let VariantKey = defer(() =>
    sequence(
        string("["),
        maybe(blank),
        either(
            NumberLiteral,
            VariantName),
        maybe(blank),
        string("]"))
    .map(element_at(2)));

let VariantName = defer(() =>
    sequence(
        word,
        repeat(
            sequence(
                blank,
                word)))
    .map(flatten(2))
    .map(join)
    .chain(into(FTL.VariantName)));

/* ----------- */
/* Identifiers */

let Identifier = defer(() =>
    identifier.chain(into(FTL.Identifier)));

let TermIdentifier = defer(() =>
    sequence(
        string("-"),
        identifier)
    .map(join)
    .chain(into(FTL.Identifier)));

let VariableIdentifier = defer(() =>
    sequence(
        string("$"),
        identifier)
    .map(element_at(1))
    .chain(into(FTL.Identifier)));

let Function =
    sequence(
        charset("A-Z"),
        repeat(
            charset("A-Z_?-")))
    .map(flatten(1))
    .map(join)
    .chain(into(FTL.Function));

/* ------ */
/* Tokens */
let identifier =
    sequence(
        charset("a-zA-Z"),
        repeat(
            charset("a-zA-Z0-9_-")))
    .map(flatten(1))
    .map(join);

let word = defer(() =>
    repeat1(
        and(
            not(string("=")),
            not(string("[")),
            not(string("]")),
            not(string("{")),
            not(string("}")),
            not(backslash),
            regular_char))
    .map(join));

/* ---------- */
/* Characters */

let backslash = string("\\");
let quote = string("\"");

/* Any Unicode character from BMP excluding C0 control characters, space,
 * surrogate blocks and non-characters (U+FFFE, U+FFFF).
 * Cf. https://www.w3.org/TR/REC-xml/#NT-Char
 * TODO Add characters from other planes: U+10000 to U+10FFFF.
 */
let regular_char =
    charset("\u0021-\uD7FF\uE000-\uFFFD");

let text_char = defer(() =>
    either(
        blank_inline,
        string("\u0009"),
        regex(/\\u[0-9a-fA-F]{4}/),
        sequence(
            backslash,
            backslash).map(join),
        sequence(
            backslash,
            string("{")).map(join),
        and(
            not(backslash),
            not(string("{")),
            regular_char)));

let text_start = defer(() =>
    and(
        not(string(".")),
        not(string("*")),
        not(string("[")),
        not(string("}")),
        text_char));

let quoted_text_char =
    either(
        and(
            not(quote),
            text_char),
        sequence(
            backslash,
            quote).map(join));

let digit = charset("0-9");

/* ---------- */
/* Whitespace */
let blank_inline =
    repeat1(
        string("\u0020"))
    .map(join);

let line_end =
    either(
        // Normalize CRLF to LF.
        string("\u000D\u000A").map(() => "\n"),
        string("\u000A"),
        eof());

let blank_block =
    repeat1(
        sequence(
            maybe(blank_inline),
            line_end.abstract))
    .map(flatten(1))
    // Discard the indents and only keep the newlines
    // for multiline Patterns.
    .map(keep_abstract)
    .map(join);

let blank =
    repeat1(
        either(
            blank_inline,
            line_end));
