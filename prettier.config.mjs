/** @type {import('prettier').Config} */
export default {
    semi: false,
    singleQuote: true,
    tabWidth: 4,
    bracketSameLine: true,
    proseWrap: 'never',
    quoteProps: 'consistent',
    overrides: [
        {
            files: '**/*.md',
            options: {
                proseWrap: 'always',
                tabWidth: 2,
            },
        },
    ],
}
