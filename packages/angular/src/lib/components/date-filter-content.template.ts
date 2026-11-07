export const DATE_FILTER_CONTENT_TEMPLATE = `
<div class="gp-grid-filter-content gp-grid-filter-date">
  <div class="gp-grid-filter-groups">
    @if (dateGroups.length > 1) {
      <div class="gp-grid-filter-combination">
        <button
          type="button"
          [class.active]="groupCombination === 'and'"
          [attr.aria-pressed]="groupCombination === 'and'"
          (click)="groupCombination = 'and'">
          {{ labels().and }}
        </button>
        <button
          type="button"
          [class.active]="groupCombination === 'or'"
          [attr.aria-pressed]="groupCombination === 'or'"
          (click)="groupCombination = 'or'">
          {{ labels().or }}
        </button>
      </div>
    }
    @for (group of dateGroups; track $index; let groupIndex = $index) {
      <div class="gp-grid-filter-group">
        @if (group.conditions.length > 1 || dateGroups.length > 1) {
          <div class="gp-grid-filter-group-actions">
            @if (group.conditions.length > 1) {
              <div class="gp-grid-filter-combination">
                <button
                  type="button"
                  [class.active]="group.combination === 'and'"
                  [attr.aria-pressed]="group.combination === 'and'"
                  (click)="group.combination = 'and'">
                  {{ labels().and }}
                </button>
                <button
                  type="button"
                  [class.active]="group.combination === 'or'"
                  [attr.aria-pressed]="group.combination === 'or'"
                  (click)="group.combination = 'or'">
                  {{ labels().or }}
                </button>
              </div>
            }
            @if (dateGroups.length > 1) {
              <button
                type="button"
                class="gp-grid-filter-remove gp-grid-filter-group-remove"
                (click)="removeGroup(groupIndex)">
                {{ labels().removeGroup }}
              </button>
            }
          </div>
        }
        @for (cond of group.conditions; track $index; let i = $index) {
          <div class="gp-grid-filter-condition">
            <div class="gp-grid-filter-row">
              <select
                [value]="cond.operator"
                (change)="cond.operator = $any($event.target).value">
                @for (op of operators(); track op.value) {
                  <option [value]="op.value">{{ op.label }}</option>
                }
              </select>
              @if (!isValueLessDateOp(cond.operator)) {
                <input
                  [type]="inputType()"
                  [value]="cond.value"
                  (input)="cond.value = $any($event.target).value" />
                @if (cond.operator === 'between') {
                  <span class="gp-grid-filter-to">{{ labels().betweenSeparator }}</span>
                  <input
                    [type]="inputType()"
                    [value]="cond.valueTo"
                    (input)="cond.valueTo = $any($event.target).value" />
                }
              }
              @if (group.conditions.length > 1) {
                <button
                  type="button"
                  class="gp-grid-filter-remove"
                  (click)="removeCondition(groupIndex, i)">
                  {{ labels().removeCondition }}
                </button>
              }
            </div>
          </div>
        }
        <button
          type="button"
          class="gp-grid-filter-add"
          (click)="addCondition(groupIndex)">
          {{ labels().addCondition }}
        </button>
      </div>
    }
    <button
      type="button"
      class="gp-grid-filter-add gp-grid-filter-add-group"
      (click)="addGroup()">
      {{ labels().addGroup }}
    </button>
  </div>
  <div class="gp-grid-filter-buttons">
    <button type="button" class="gp-grid-filter-btn-clear" (click)="apply.emit(null)">
      {{ labels().clear }}
    </button>
    <button type="button" class="gp-grid-filter-btn-apply" (click)="handleApply()">
      {{ labels().apply }}
    </button>
  </div>
</div>
`;
