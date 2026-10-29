export const PLACEMENT_TYPES = [
  ['led', 'LED / DIGITAL BOARD'], ['static', 'STATIC PITCHSIDE BOARD'],
  ['jersey', 'JERSEY / KIT'], ['backdrop', 'BACKDROP / INTERVIEW'],
  ['stadium', 'STADIUM SIGNAGE'], ['graphic', 'BROADCAST GRAPHIC'],
  ['other', 'OTHER PLACEMENT'],
] as const;

export const VISIBILITY_QUALITIES = [
  ['clear', 'CLEAR / READABLE'], ['partial', 'PARTIALLY READABLE'],
  ['obscured', 'OBSCURED / NOT READABLE'],
] as const;
