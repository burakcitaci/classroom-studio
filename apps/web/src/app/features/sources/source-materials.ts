import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { FormsModule } from '@angular/forms';
import { roleLabels, roles, type ClassMaterial, type Source } from '../../../../../../libs/contracts/src';

@Component({
  selector: 'studio-source-materials',
  imports: [FormsModule, Icon],
  templateUrl: './source-materials.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceMaterials {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly roles = roles;
  protected readonly roleLabels = roleLabels;
  protected openSource?: string;
  protected drag = false;
  protected readonly materials = signal<ClassMaterial[]>([]);
  protected readonly materialsBusy = signal(false);
  protected readonly materialsError = signal('');

  protected async loadMaterials(event: Event) {
    if (!(event.target as HTMLDetailsElement).open) return;
    await this.updateMaterials(async () => this.materials.set(await this.vm.loadMaterials()));
  }

  protected async share(source: Source) {
    await this.updateMaterials(async () => this.materials.set(await this.vm.shareMaterial(source)));
  }

  protected async attach(material: ClassMaterial) {
    await this.updateMaterials(() => this.vm.attachMaterial(material.id));
  }

  protected attached(material: ClassMaterial) {
    return this.vm.activeSources.some(source => source.id === material.id || source.materialId === material.id);
  }

  private async updateMaterials(work: () => Promise<void>) {
    if (this.materialsBusy()) return;
    this.materialsBusy.set(true);
    this.materialsError.set('');
    try { await work(); }
    catch (error) { this.materialsError.set(error instanceof Error ? error.message : String(error)); }
    finally { this.materialsBusy.set(false); }
  }

  protected drop(event: DragEvent) {
    event.preventDefault();
    this.drag = false;
    void this.vm.upload(event.dataTransfer?.files ?? null);
  }

}
