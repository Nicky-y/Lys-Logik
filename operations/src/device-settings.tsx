import { Smartphone } from 'lucide-react';
import { InstallApp } from './pwa';
import { PushSettings } from './push';
import type { PushController } from './push-controller';
import './device-settings.css';

export function DeviceSettings({
  push,
  canWork,
  demo,
}: {
  push?: PushController;
  canWork: boolean;
  demo: boolean;
}) {
  return (
    <section
      className="settings-panel device-settings"
      aria-labelledby="device-settings-title"
    >
      <h2 id="device-settings-title">App og notifikationer</h2>
      <p>Tilpas appen på denne enhed.</p>
      {demo && (
        <p className="device-demo-note">
          Prøvevisning · Kontakten kan afprøves her. Det installerer ikke appen
          og ændrer ikke telefonens tilladelser.
        </p>
      )}
      <div className="device-setting-row">
        <span className="device-setting-icon">
          <Smartphone size={22} aria-hidden="true" />
        </span>
        <div className="device-setting-copy">
          <h3>App på telefonen</h3>
          <p>Åbn arbejdsrummet direkte fra din hjemmeskærm.</p>
        </div>
        <div className="device-setting-action">
          <InstallApp demo={demo} />
        </div>
      </div>
      <PushSettings
        controller={canWork ? push : undefined}
        unavailableReason={
          canWork
            ? 'Notifikationer er ikke konfigureret i denne version af appen.'
            : 'Kundenotifikationer kræver en arbejdsrolle.'
        }
      />
    </section>
  );
}
