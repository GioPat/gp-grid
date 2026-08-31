export const FILTER_POPUP_TEMPLATE = `
<div
  #popupEl
  class="gp-grid-filter-popup"
  [style.position]="'fixed'"
  [style.zIndex]="10000"
  [style.top.px]="popupTop()"
  [style.left.px]="popupLeft()"
  [style.minWidth.px]="popupMinWidth()"
  [style.visibility]="positioned() ? 'visible' : 'hidden'"
  (keydown.escape)="close.emit()"
  (click)="$event.stopPropagation()">

  <div class="gp-grid-filter-header">
    {{ filterTitle() }}
  </div>

  <div [class]="'gp-grid-filter-content ' + (isNumberColumn() ? 'gp-grid-filter-number' : 'gp-grid-filter-text')">
  @if (isNumberColumn()) {
    <div class="gp-grid-filter-groups">
      @if (numberGroups.length > 1) {
        <div class="gp-grid-filter-combination">
          <button
            type="button"
            [class.active]="groupCombination === 'and'"
            [attr.aria-pressed]="groupCombination === 'and'"
            (click)="setGroupCombination('and')">
            {{ labels().and }}
          </button>
          <button
            type="button"
            [class.active]="groupCombination === 'or'"
            [attr.aria-pressed]="groupCombination === 'or'"
            (click)="setGroupCombination('or')">
            {{ labels().or }}
          </button>
        </div>
      }
      @for (group of numberGroups; track $index; let groupIndex = $index) {
        <div class="gp-grid-filter-group">
          @if (group.conditions.length > 1 || numberGroups.length > 1) {
            <div class="gp-grid-filter-group-actions">
              @if (group.conditions.length > 1) {
                <div class="gp-grid-filter-combination">
                  <button
                    type="button"
                    [class.active]="group.combination === 'and'"
                    [attr.aria-pressed]="group.combination === 'and'"
                    (click)="setNumberGroupCombination(groupIndex, 'and')">
                    {{ labels().and }}
                  </button>
                  <button
                    type="button"
                    [class.active]="group.combination === 'or'"
                    [attr.aria-pressed]="group.combination === 'or'"
                    (click)="setNumberGroupCombination(groupIndex, 'or')">
                    {{ labels().or }}
                  </button>
                </div>
              }
              @if (numberGroups.length > 1) {
                <button
                  type="button"
                  class="gp-grid-filter-remove gp-grid-filter-group-remove"
                  (click)="removeNumberGroup(groupIndex)">
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
                  (change)="onNumberOperatorChange(groupIndex, i, $any($event.target).value)">
                  @for (op of numberOperators(); track op.value) {
                    <option [value]="op.value">{{ op.label }}</option>
                  }
                </select>
                @if (!isValueLessNumberOp(cond.operator)) {
                  <input
                    type="number"
                    [value]="cond.value"
                    (input)="cond.value = $any($event.target).value"
                    [placeholder]="labels().valuePlaceholder" />
                  @if (cond.operator === 'between') {
                    <span class="gp-grid-filter-to">{{ labels().betweenSeparator }}</span>
                    <input
                      type="number"
                      [value]="cond.valueTo"
                      (input)="cond.valueTo = $any($event.target).value"
                      [placeholder]="labels().valuePlaceholder" />
                  }
                }
                @if (group.conditions.length > 1) {
                  <button
                    type="button"
                    class="gp-grid-filter-remove"
                    (click)="removeNumberCondition(groupIndex, i)">
                    {{ labels().removeCondition }}
                  </button>
                }
              </div>
            </div>
          }
          <button
            type="button"
            class="gp-grid-filter-add"
            (click)="addNumberCondition(groupIndex)">
            {{ labels().addCondition }}
          </button>
        </div>
      }
      <button
        type="button"
        class="gp-grid-filter-add gp-grid-filter-add-group"
        (click)="addNumberGroup()">
        {{ labels().addGroup }}
      </button>
    </div>
  } @else {
    @if (showValuesMode()) {
      <div class="gp-grid-filter-mode-toggle">
        <button
          type="button"
          [class.active]="filterMode === 'values'"
          [attr.aria-pressed]="filterMode === 'values'"
          (click)="filterMode = 'values'">
          {{ labels().valuesMode }}
        </button>
        <button
          type="button"
          [class.active]="filterMode === 'condition'"
          [attr.aria-pressed]="filterMode === 'condition'"
          (click)="filterMode = 'condition'">
          {{ labels().conditionMode }}
        </button>
      </div>
    }

    @if (filterMode === 'values' && showValuesMode()) {
      <input
        class="gp-grid-filter-search"
        type="text"
        [value]="searchText"
        (input)="searchText = $any($event.target).value"
        [placeholder]="labels().searchPlaceholder" />
      <div class="gp-grid-filter-actions">
        <button type="button" (click)="selectAll()">{{ labels().selectAll }}</button>
        <button type="button" (click)="deselectAll()">{{ labels().deselectAll }}</button>
      </div>
      <div class="gp-grid-filter-list">
        @if (hasBlanks()) {
          <label class="gp-grid-filter-option">
            <input
              type="checkbox"
              [checked]="includeBlanks"
              (change)="includeBlanks = $any($event.target).checked" />
            <span class="gp-grid-filter-blank">{{ labels().blanks }}</span>
          </label>
        }
        @for (entry of filteredUniqueEntries(); track entry.label) {
          <label class="gp-grid-filter-option">
            <input
              type="checkbox"
              [checked]="selectedLabels.has(entry.label)"
              (change)="toggleValue(entry.label, $any($event.target).checked)" />
            <span>{{ entry.label }}</span>
          </label>
        }
      </div>
    }

    @if (filterMode === 'condition') {
      <div class="gp-grid-filter-groups">
        @if (textGroups.length > 1) {
          <div class="gp-grid-filter-combination">
            <button
              type="button"
              [class.active]="groupCombination === 'and'"
              [attr.aria-pressed]="groupCombination === 'and'"
              (click)="setGroupCombination('and')">
              {{ labels().and }}
            </button>
            <button
              type="button"
              [class.active]="groupCombination === 'or'"
              [attr.aria-pressed]="groupCombination === 'or'"
              (click)="setGroupCombination('or')">
              {{ labels().or }}
            </button>
          </div>
        }
        @for (group of textGroups; track $index; let groupIndex = $index) {
          <div class="gp-grid-filter-group">
            @if (group.conditions.length > 1 || textGroups.length > 1) {
              <div class="gp-grid-filter-group-actions">
                @if (group.conditions.length > 1) {
                  <div class="gp-grid-filter-combination">
                    <button
                      type="button"
                      [class.active]="group.combination === 'and'"
                      [attr.aria-pressed]="group.combination === 'and'"
                      (click)="setTextGroupCombination(groupIndex, 'and')">
                      {{ labels().and }}
                    </button>
                    <button
                      type="button"
                      [class.active]="group.combination === 'or'"
                      [attr.aria-pressed]="group.combination === 'or'"
                      (click)="setTextGroupCombination(groupIndex, 'or')">
                      {{ labels().or }}
                    </button>
                  </div>
                }
                @if (textGroups.length > 1) {
                  <button
                    type="button"
                    class="gp-grid-filter-remove gp-grid-filter-group-remove"
                    (click)="removeTextGroup(groupIndex)">
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
                    (change)="onTextOperatorChange(groupIndex, i, $any($event.target).value)">
                    @for (op of textOperators(); track op.value) {
                      <option [value]="op.value">{{ op.label }}</option>
                    }
                  </select>
                  @if (!isValueLessTextOp(cond.operator)) {
                    <input
                      class="gp-grid-filter-text-input"
                      type="text"
                      [value]="cond.value"
                      (input)="cond.value = $any($event.target).value"
                      [placeholder]="labels().valuePlaceholder" />
                  }
                  @if (group.conditions.length > 1) {
                    <button
                      type="button"
                      class="gp-grid-filter-remove"
                      (click)="removeTextCondition(groupIndex, i)">
                      {{ labels().removeCondition }}
                    </button>
                  }
                </div>
              </div>
            }
            <button
              type="button"
              class="gp-grid-filter-add"
              (click)="addTextCondition(groupIndex)">
              {{ labels().addCondition }}
            </button>
          </div>
        }
        <button
          type="button"
          class="gp-grid-filter-add gp-grid-filter-add-group"
          (click)="addTextGroup()">
          {{ labels().addGroup }}
        </button>
      </div>
    }
  }

    <div class="gp-grid-filter-buttons">
      <button type="button" class="gp-grid-filter-btn-clear" (click)="handleClear()">
        {{ labels().clear }}
      </button>
      <button type="button" class="gp-grid-filter-btn-apply" (click)="handleApply()">
        {{ labels().apply }}
      </button>
    </div>
  </div>
</div>
`;
