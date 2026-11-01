import type { Sponsor, SponsorAnnotation, SponsorProperty } from '../types/models';

export const DEFAULT_CLARITY: SponsorProperty = {
  id: 'clarity', name: 'Clarity', defaultOptionId: 'clearly-visible',
  options: [
    { id: 'clearly-visible', label: 'Clearly visible' },
    { id: 'unclear', label: 'Unclear' },
  ],
};

/** Legacy sponsors inherit clarity; the default has no stored annotation value. */
export function sponsorProperties(sponsor: Sponsor): SponsorProperty[] {
  return sponsor.properties === undefined ? [DEFAULT_CLARITY] : sponsor.properties;
}

export function distinctSponsorPropertyValues(properties: Record<string, string> | undefined, sponsor: Sponsor) {
  return sponsorProperties(sponsor).filter(prop =>
    properties?.[prop.id] && properties[prop.id] !== prop.defaultOptionId);
}

/**
 * A sub-attribute belongs to its parent sponsor appearance; it has no
 * independent clock or deletion path. Closing or resizing that appearance
 * automatically closes/resizes every nested classification with it.
 */
export function sponsorPropertyIntervals(row:SponsorAnnotation,sponsor:Sponsor) {
  return distinctSponsorPropertyValues(row.properties,sponsor).map(property=>({
    annotationId:row.id,propertyId:property.id,propertyName:property.name,
    optionId:row.properties![property.id],
    optionLabel:property.options.find(option=>option.id===row.properties![property.id])?.label||row.properties![property.id],
    start:row.start,end:row.end,
  }));
}
