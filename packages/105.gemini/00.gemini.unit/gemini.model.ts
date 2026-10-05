import type Gemini from './fce/gemini.interface'

export class GeminiModel implements Gemini {
    idx = '105.gemini'
    defaultNotebookId = '25fcd56e-a95d-46f8-9b11-c9bace81da4b'
    targetUrl =
        'https://gemini.google.com/notebook/25fcd56e-a95d-46f8-9b11-c9bace81da4b'
    hydrationDelayMs = 2800
}
