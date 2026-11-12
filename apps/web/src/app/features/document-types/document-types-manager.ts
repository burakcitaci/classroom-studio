import { ChangeDetectionStrategy, Component, inject, output, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { documentTypeInputSchema, type DocumentType, type DocumentTypeInput } from '../../../../../../libs/contracts/src';
import { TeacherDialog } from '../../shared/teacher-dialog/teacher-dialog';
import { Icon } from '../../shared/icon/icon';
import { Notifications } from '../../core/notifications';
import { DocumentTypesStore } from './document-types.store';

@Component({
  selector: 'studio-document-types-manager', imports: [FormsModule, TeacherDialog, Icon],
  templateUrl: './document-types-manager.html', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentTypesManager implements OnInit {
  readonly closed = output<void>();
  readonly selected = output<DocumentType>();
  protected readonly types = inject(DocumentTypesStore);
  private readonly notifications = inject(Notifications);
  protected current?: DocumentType;
  protected readonly form = signal<DocumentTypeInput | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  ngOnInit() { void this.types.load(); }
  protected edit(type?: DocumentType) {
    this.current = type;
    this.error.set('');
    this.form.set(type ? { title: type.title, guidance: type.guidance, audience: type.audience } : { title: '', guidance: '', audience: 'student' });
  }
  protected example() {
    this.current = undefined;
    this.error.set('');
    this.form.set({ title: 'Erwartungshorizont', audience: 'teacher', guidance:
      'Erstelle einen Erwartungshorizont mit Musterlösungen und transparenter Punkteverteilung für jede Teilaufgabe. Nutze die ausgewählten Aufgaben als Grundlage. Nenne wesentliche Bewertungskriterien und zulässige Lösungsalternativen. Fehlen wichtige Angaben, kennzeichne sie als Prüfhinweis.' });
  }
  protected async save() {
    if (this.busy()) return;
    const parsed = documentTypeInputSchema.safeParse(this.form());
    if (!parsed.success) { this.error.set($localize`:@@typeFieldsRequired:Enter a name and reusable guidance for this type.`); return; }
    this.busy.set(true); this.error.set('');
    try {
      const saved = await this.types.save(parsed.data, this.current);
      this.notifications.success($localize`:@@typeSaved:Document type saved.`);
      this.selected.emit(saved);
    } catch (error) { this.error.set(error instanceof Error ? error.message : $localize`:@@typeSaveError:Could not save the document type.`); }
    finally { this.busy.set(false); }
  }
  protected async archive(type: DocumentType) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      await this.types.save({ title: type.title, guidance: type.guidance, audience: type.audience }, type, true);
      this.notifications.success($localize`:@@typeArchived:Type archived. Existing documents keep their saved guidance.`);
    } catch (error) { this.error.set(error instanceof Error ? error.message : $localize`:@@typeSaveError:Could not save the document type.`); }
    finally { this.busy.set(false); }
  }
}
