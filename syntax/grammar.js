import * as FTL from "./ast.js";
import {list_into, into} from "./abstract.js";
import {
    always, and, charset, defer, either, eof, maybe, not,
    regex, repeat0, repeat, repeat1, sequence, string
} from "../lib/combinators.js";
import {
    element_at, flatten, join, keep_abstract, mutate, print, prune
} from "../lib/mappers.js";

// repeat0 is only imported for validation tests.
repeat0;

/* ----------------------------------------------------- */
/* An FTL file defines a Resource consisting of Entries. */
export
let Resource = defer(() =>
    repeat(
        either(
            Entry,
            blank_block,
            Junk))
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
        sequence(
            Message,
            line_end).map(element_at(0)),
        sequence(
            Term,
            line_end).map(element_at(0)),
        CommentLine));

let Message = defer(() =>
    sequence(
        Identifier.abstract,
        maybe(blank_inline),
        string("="),
        maybe(blank_inline),
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
        string("-"),
        Identifier.abstract,
        maybe(blank_inline),
        string("="),
        maybe(blank_inline),
        Pattern.abstract,
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
                repeat(comment_char)
                    .map(join).abstract)),
        line_end)
    .map(flatten(1))
    .map(keep_abstract)
    .chain(list_into(FTL.Comment)));

let comment_char = defer(() =>
    and(
        not(line_end),
        any_char));

/* -------------------------------------------------------------------------- */
/* Junk represents unparsed content.
 *
 * Junk is parsed line-by-line until a line is found which looks like it might
 * be a beginning of a new message, term, or a comment. Any whitespace
 * following a broken Entry is also considered part of Junk.
 */
let Junk = defer(() =>
    sequence(
        junk_line,
        repeat(
            and(
                not(charset("a-zA-Z")),
                not(string("-")),
                not(string("#")),
                junk_line)))
    .map(flatten(1))
    .map(join)
    .chain(into(FTL.Junk)));

let junk_line =
    sequence(
        regex(/[^\n]*/),
        either(
            string("\u000A"),
            eof()))
    .map(join);

/* --------------------------------- */
/* Attributes of Messages and Terms. */
let Attribute = defer(() =>
    sequence(
        line_end,
        maybe(blank),
        string("."),
        Identifier.abstract,
        maybe(blank_inline),
        string("="),
        maybe(blank_inline),
        Pattern.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.Attribute)));

/* ---------------------------------------------------------------- */
/* Patterns are values of Messages, Terms, Attributes and Variants. */
let Pattern = defer(() =>
    repeat1(
        PatternElement)
    // Flatten block_text and block_placeable which return lists.
    .map(flatten(1))
    .chain(list_into(FTL.Pattern)));

/* ----------------------------------------------------------------- */
/* TextElement and Placeable can occur inline or as block.
 * Text needs to be indented and start with a non-special character.
 * Placeables can start at the beginning of the line or be indented.
 * Adjacent TextElements are joined in AST creation. */

let PatternElement = defer(() =>
    either(
        inline_text,
        block_text,
        inline_placeable,
        block_placeable));

let inline_text = defer(() =>
    repeat(text_char)
    .map(join)
    .chain(into(FTL.TextElement)));

let block_text = defer(() =>
    sequence(
        blank_block.chain(into(FTL.TextElement)),
        blank_inline,
        indented_char.chain(into(FTL.TextElement)),
        maybe(inline_text))
    .map(prune));

let inline_placeable = defer(() =>
    sequence(
        string("{"),
        not(blank),
        either(
            // Order matters!
            SelectExpression,
            InlineExpression),
        not(blank),
        string("}"))
    .map(element_at(2))
    .chain(into(FTL.Placeable)));

let block_placeable = defer(() =>
    sequence(
        blank_block.chain(into(FTL.TextElement)),
        // No indent before a placeable counts as 0 in dedention logic.
        maybe(blank_inline).map(s => s || ""),
        inline_placeable));

/* ------------------------------------------------------------------- */
/* Rules for validating expressions in Placeables and as selectors of
 * SelectExpressions are documented in spec/valid.md and enforced in
 * syntax/abstract.js. */
let InlineExpression = defer(() =>
    either(
        StringLiteral,
        NumberLiteral,
        FunctionReference,
        MessageReference,
        TermReference,
        VariableReference,
        inline_placeable));

/* -------- */
/* Literals */
export
let StringLiteral = defer(() =>
    sequence(
        string("\""),
        repeat(quoted_char),
        string("\""))
    .map(element_at(1))
    .map(join)
    .chain(into(FTL.StringLiteral)));

export
let NumberLiteral = defer(() =>
    sequence(
        maybe(string("-")),
        digits,
        maybe(
            sequence(
                string("."),
                digits)))
    .map(flatten(1))
    .map(join)
    .chain(into(FTL.NumberLiteral)));

/* ------------------ */
/* Inline Expressions */
let FunctionReference = defer(() =>
    sequence(
        Identifier,
        CallArguments)
    .chain(list_into(FTL.FunctionReference)));

let MessageReference = defer(() =>
    sequence(
        Identifier,
        maybe(AttributeAccessor))
    .chain(list_into(FTL.MessageReference)));

let TermReference = defer(() =>
    sequence(
        string("-"),
        Identifier.abstract,
        maybe(AttributeAccessor).abstract,
        maybe(CallArguments).abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.TermReference)));

let VariableReference = defer(() =>
    sequence(
        string("$"),
        Identifier)
    .map(element_at(1))
    .chain(into(FTL.VariableReference)));

let AttributeAccessor = defer(() =>
    sequence(
        string("."),
        Identifier))
    .map(element_at(1));

let CallArguments = defer(() =>
    sequence(
        maybe(blank),
        string("("),
        maybe(blank),
        argument_list,
        maybe(blank),
        string(")"))
    .map(element_at(3))
    .chain(into(FTL.CallArguments)));

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

/* ----------------- */
/* Block Expressions */
let SelectExpression = defer(() =>
    sequence(
        InlineExpression.abstract,
        maybe(blank),
        string("->"),
        maybe(blank_inline),
        variant_list.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.SelectExpression)));

let variant_list = defer(() =>
    sequence(
        repeat(Variant).abstract,
        DefaultVariant.abstract,
        repeat(Variant).abstract,
        line_end)
    .map(keep_abstract)
    .map(flatten(1)));

let Variant = defer(() =>
    sequence(
        line_end,
        maybe(blank),
        VariantKey.abstract,
        maybe(blank_inline),
        Pattern.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.Variant)));

let DefaultVariant = defer(() =>
    sequence(
        line_end,
        maybe(blank),
        string("*"),
        VariantKey.abstract,
        maybe(blank_inline),
        Pattern.abstract)
    .map(keep_abstract)
    .chain(list_into(FTL.Variant))
    .map(mutate({default: true})));

let VariantKey = defer(() =>
    sequence(
        string("["),
        maybe(blank),
        either(
            NumberLiteral,
            Identifier),
        maybe(blank),
        string("]"))
    .map(element_at(2)));

/* ---------- */
/* Identifier */

let Identifier =
    sequence(
        charset("a-zA-Z"),
        repeat(
            charset("a-zA-Z0-9_-")))
    .map(flatten(1))
    .map(join)
    .chain(into(FTL.Identifier));

/* -------------------------------------------------------------------------- */
/* Content Characters
 *
 * Translation content can be written using any Unicode characters. However,
 * some characters are considered special depending on the type of content
 * they're in. See text_char and quoted_char for more information.
 *
 * Some Unicode characters, even if allowed, should be avoided in Fluent
 * resources. See spec/recommendations.md.
 */

let any_char =
    charset("\\u{0}-\\u{10FFFF}");

/* -------------------------------------------------------------------------- */
/* Text elements
 *
 * The primary storage for content are text elements. Text elements are not
 * delimited with quotes and may span multiple lines as long as all lines are
 * indented. The opening brace ({) marks a start of a placeable in the pattern
 * and may not be used in text elements verbatim. Due to the indentation
 * requirement some text characters may not appear as the first character on a
 * new line.
 */

let special_text_char =
    either(
        string("{"),
        string("}"));

let text_char = defer(() =>
    and(
        not(line_end),
        not(special_text_char),
        any_char));

let indented_char =
    and(
        not(string(".")),
        not(string("*")),
        not(string("[")),
        text_char);

/* -------------------------------------------------------------------------- */
/* String literals
 *
 * For special-purpose content, quoted string literals can be used where text
 * elements are not a good fit. String literals are delimited with double
 * quotes and may not contain line breaks. String literals use the backslash
 * (\) as the escape character. The literal double quote can be inserted via
 * the \" escape sequence. The literal backslash can be inserted with \\. The
 * literal opening brace ({) is allowed in string literals because they may not
 * comprise placeables.
 */

let special_quoted_char =
    either(
        string("\""),
        string("\\"));

let special_escape =
    sequence(
        string("\\"),
        special_quoted_char)
    .map(join);

let unicode_escape =
    either(
        sequence(
            string("\\u"),
            regex(/[0-9a-fA-F]{4}/)),
        sequence(
            string("\\U"),
            regex(/[0-9a-fA-F]{6}/)))
    .map(join);

let quoted_char = defer(() =>
    either(
        and(
            not(line_end),
            not(special_quoted_char),
            any_char),
        special_escape,
        unicode_escape));

/* ------- */
/* Numbers */

let digits =
    repeat1(
        charset("0-9"))
    .map(join);

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
