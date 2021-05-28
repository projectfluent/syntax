# Terms

Terms are similar to regular messages but they can only be used as references
in other messages. Their identifiers start with a single dash `-` like in the
example above: `-brand-name`. The runtime cannot retrieve terms directly.
They are best used to define vocabulary and glossary items which can be used
consistently across the localization of the entire product.

```
-brand-name = Firefox

about = About { -brand-name }.
update-successful = { -brand-name } has been updated.
```

## Parameterized Terms

Term values follow the same rules as message values. They can be simple text,
or they can interpolate other expressions, including variables. However,
while messages receive data for variables directly from the app, terms
receive such data from messages in which they are used. Such references take
the form of `-term(…)` where the variables available inside of the term are
defined between the parentheses, e.g. `-term(param: "value")`.

```
# A contrived example to demonstrate how variables
# can be passed to terms.
-https = https://{ $host }
visit = Visit { -https(host: "example.com") } for more information.
```

The above example isn't very useful and a much better approach in this
particular case would be to use the full address directly in the `visit`
message. There is, however, another use-case which takes full advantage of
this feature. By passing variables into the term, you can define select
expressions with multiple variants of the same term value.

```
-brand-name =
    { $case ->
       *[nominative] Firefox
        [locative] Firefoksie
    }

# "About Firefox."
about = Informacje o { -brand-name(case: "locative") }.
```

This pattern can be very useful for defining multiple _facets_ of the term,
which can correspond to grammatical cases or other grammatical or stylistic
properties of the language. In many inflected languages (e.g. German,
Finnish, Hungarian, all Slavic languages), the *about* preposition governs
the grammatical case of the complement. It might be accusative (German),
ablative (Latin), or locative (Slavic languages). The grammatical cases can
be defined as variants of the same tem and referred to via parameterization
from other messages. This is what happens in the `about` message above.

If no parameters are passed into the term, or if the term is referenced
without any parentheses, the default variant will be used.

```
-brand-name =
    { $case ->
       *[nominative] Firefox
        [locative] Firefoksie
    }

# "Firefox has been successfully updated."
update-successful = { -brand-name } został pomyślnie zaktualizowany.
```

## Terms and Attributes

Sometimes translations might vary depending on some grammatical trait of a
term references in them. Terms can store this grammatical information about
themselves in [attributes](attributes.html). In the example below the form of
the past tense of _has been updated_ depends on the grammatical gender of
`-brand-name`.

```
-brand-name = Aurora
    .gender = feminine

update-successful =
    { -brand-name.gender ->
        [masculine] { -brand-name } został zaktualizowany.
        [feminine] { -brand-name } została zaktualizowana.
       *[other] Program { -brand-name } został zaktualizowany.
    }
```

Use attributes to describe grammatical traits and properties. Genders,
animacy, whether the term message starts with a vowel or not etc. Attributes
of terms are private and cannot be retrieved by the localization runtime.
They can only be used as [selectors](selectors.html). If needed, they can
also be parameterized using the `-term.attr(param: "value")` syntax.
