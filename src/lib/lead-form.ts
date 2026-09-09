import { validateLead, type LeadField, type LeadInput } from './lead.ts';
import { createLeadSender } from './submit-lead.ts';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function initializeLeadForm() {
  const form = document.querySelector<HTMLFormElement>('#pilot-form')!;
  const fields = document.querySelector<HTMLFieldSetElement>('#form-fields')!;
  const success = document.querySelector<HTMLDivElement>('#form-success')!;
  const summary = document.querySelector<HTMLDivElement>(
    '#form-error-summary',
  )!;
  const buttonText = form.querySelector<HTMLSpanElement>(
    'button[type=submit] span',
  )!;
  const defaultButtonText = buttonText.textContent;
  const names: LeadField[] = [
    'name',
    'email',
    'phone',
    'postalCode',
    'service',
    'description',
    'terms',
  ];
  const endpoint = form.dataset.leadEndpoint ?? '';
  const send = endpoint ? createLeadSender(endpoint) : undefined;
  let token = '';
  let widgetId: string | undefined;
  let busy = false;

  const showError = (text: string) => {
    summary.hidden = false;
    summary.textContent = text;
  };
  function clearErrors() {
    for (const name of names) {
      document.getElementById(name)!.removeAttribute('aria-invalid');
      document.getElementById(`${name}-error`)!.textContent = '';
    }
    summary.hidden = true;
    summary.textContent = '';
  }
  function resetChallenge() {
    token = '';
    if (widgetId !== undefined) window.turnstile?.reset(widgetId);
  }
  document
    .querySelectorAll<HTMLAnchorElement>('[data-service]')
    .forEach((link) => {
      link.addEventListener('click', () => {
        if (!busy)
          (form.elements.namedItem('service') as HTMLSelectElement).value =
            link.dataset.service!;
      });
    });
  if (send) {
    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      widgetId = window.turnstile?.render(
        document.getElementById('turnstile-widget')!,
        {
          sitekey: form.dataset.turnstileSiteKey,
          action: 'create-lead',
          theme: 'light',
          size: 'flexible',
          callback: (value: string) => {
            token = value;
          },
          'expired-callback': () => {
            token = '';
          },
          'error-callback': () => {
            token = '';
            showError(
              'Sikkerhedskontrollen kunne ikke indlæses. Prøv at genindlæse siden.',
            );
          },
        },
      );
    };
    script.onerror = () =>
      showError(
        'Sikkerhedskontrollen kunne ikke indlæses. Prøv at genindlæse siden.',
      );
    document.head.append(script);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    clearErrors();
    const data = new FormData(form);
    const input: LeadInput = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      phone: String(data.get('phone') ?? ''),
      postalCode: String(data.get('postalCode') ?? ''),
      service: String(data.get('service') ?? ''),
      description: String(data.get('description') ?? ''),
      terms: data.get('terms') === 'on',
    };
    const errors = validateLead(input);
    const invalid = names.filter((name) => errors[name]);
    if (invalid.length) {
      showError('Tjek de markerede felter, og prøv igen.');
      for (const name of invalid) {
        document.getElementById(name)!.setAttribute('aria-invalid', 'true');
        document.getElementById(`${name}-error`)!.textContent = errors[name]!;
      }
      document.getElementById(invalid[0])!.focus();
      return;
    }
    if (send && !token) {
      showError('Vent på sikkerhedskontrollen, og prøv derefter at sende.');
      return;
    }
    busy = true;
    fields.disabled = true;
    form.setAttribute('aria-busy', 'true');
    buttonText.textContent = 'Sender…';
    try {
      if (send) {
        const receipt = await send(input, token);
        document.getElementById('lead-reference')!.textContent =
          receipt.reference;
      }
      form.reset();
      form.hidden = true;
      success.hidden = false;
      success.focus();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : 'Vi kunne ikke bekræfte modtagelsen. Prøv igen.',
      );
    } finally {
      busy = false;
      fields.disabled = false;
      form.removeAttribute('aria-busy');
      buttonText.textContent = defaultButtonText;
      if (send) resetChallenge();
    }
  });
  fields.disabled = false;
  document.querySelector('#form-reset')!.addEventListener('click', () => {
    success.hidden = true;
    form.hidden = false;
    clearErrors();
    document.getElementById('name')!.focus();
  });
}
