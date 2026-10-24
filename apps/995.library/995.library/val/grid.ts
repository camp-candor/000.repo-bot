export type Position<Type> = {
    x: number
    y: number
} & Type

export type GridFill = Position<{
    xSpan: number
    ySpan: number
}>

export const TOP_FULL_IDX = 'top-fill'
export const MID_FULL_IDX = 'mid-fill'
export const BOT_FULL_IDX = 'bot-fill'

export const TOP_FULL_BIT: GridFill = { x: 0, y: 0, xSpan: 12, ySpan: 4 }
export const MID_FULL_BIT: GridFill = { x: 0, y: 4, xSpan: 12, ySpan: 5 }
export const BOT_FULL_BIT: GridFill = { x: 0, y: 8, xSpan: 12, ySpan: 4 }

export const CONTROL_AXIS_IDX = 'control-axis'
export const TELEMETRY_AXIS_IDX = 'telemetry-axis'
export const STATUS_HUD_IDX = 'status-hud'
export const CONSOLE_LOG_IDX = 'console-log'

export const CONTROL_AXIS_BIT: GridFill = { x: 0, y: 0, xSpan: 4, ySpan: 12 }
export const TELEMETRY_AXIS_BIT: GridFill = { x: 4, y: 0, xSpan: 8, ySpan: 12 }
export const STATUS_HUD_BIT: GridFill = { x: 4, y: 0, xSpan: 8, ySpan: 3 }
export const CONSOLE_LOG_BIT: GridFill = { x: 4, y: 3, xSpan: 8, ySpan: 9 }
