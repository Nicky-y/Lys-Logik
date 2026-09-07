/** Input and errors for the local-only pilot-form preview. Validation never sends or saves personal data. */
export type LeadField =
  'name' | 'contact' | 'postalCode' | 'service' | 'description' | 'terms';
export type LeadInput = Record<Exclude<LeadField, 'terms'>, string> & {
  terms: boolean;
};
export type LeadErrors = Partial<Record<LeadField, string>>;

export function validateLead(input: LeadInput): LeadErrors {
  const errors: LeadErrors = {};
  const contact = input.contact.trim();
  const phone = contact.replace(/[\s-]/g, '');
  if (input.name.trim().length < 2 || input.name.trim().length > 100)
    errors.name = 'Skriv dit navn (2–100 tegn).';
  if (
    contact.length > 254 ||
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) &&
      !/^(?:\+45)?[0-9]{8}$/.test(phone))
  )
    errors.contact =
      'Skriv en e-mailadresse eller et dansk telefonnummer med 8 cifre.';
  if (!/^[0-9]{4}$/.test(input.postalCode.trim()))
    errors.postalCode = 'Skriv et postnummer med 4 cifre.';
  if (
    !['belysning', 'smart-home', 'forbedringer', 'andet'].includes(
      input.service,
    )
  )
    errors.service = 'Vælg, hvad du gerne vil have hjælp til.';
  if (
    input.description.trim().length < 10 ||
    input.description.trim().length > 1500
  )
    errors.description = 'Beskriv din opgave med 10–1.500 tegn.';
  if (!input.terms) errors.terms = 'Bekræft, at du har læst om pilotprojektet.';
  return errors;
}
