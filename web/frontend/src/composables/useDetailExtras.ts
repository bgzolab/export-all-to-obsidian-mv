import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'

import { ApiError, api } from '@/api/client'
import type { ColumnMeta, SchemaResponse, TableMeta } from '@/api/types'
import { detailFieldValue, firstDetailValue } from '@/config/details'
import type { DetailConfig, DetailFieldSpec } from '@/config/details'
import {
  foldersBySourceKey,
  sourceEntries,
  specColumnName,
  specTextFor,
} from '@/utils/extras'
import type { FolderEntry, SourceEntry } from '@/utils/extras'

/**
 * Load the secondary data that a platform detail page folds in: article body,
 * provenance rows, favorite folders and inline child rows. Each section uses
 * at most two batch queries; a missing section never hides the main record.
 */
export function useDetailExtras(
  config: ComputedRef<DetailConfig | undefined>,
  schema: Ref<SchemaResponse | null | undefined>,
) {
  const lookupValue = ref<unknown>(undefined)
  const lookupColumn = ref<ColumnMeta | undefined>(undefined)
  const lookupLoading = ref(false)
  const sourceItems = ref<SourceEntry[]>([])
  const folderItems = ref<FolderEntry[]>([])
  const childrenRows = ref<Array<Record<string, unknown>>>([])
  const childrenTotal = ref(0)
  const childrenLoading = ref(false)
  const childrenError = ref('')
  let extrasSequence = 0

  const lookupConfig = computed(() => config.value?.lookup)
  const lookupTable = computed<TableMeta | undefined>(() =>
    schema.value?.tables.find((item) => item.name === lookupConfig.value?.table),
  )
  const childrenConfig = computed(() => config.value?.children)
  const childrenTable = computed<TableMeta | undefined>(() =>
    schema.value?.tables.find((item) => item.name === childrenConfig.value?.table),
  )
  const sourceConfigs = computed(() => config.value?.sources ?? [])
  const folderConfig = computed(() => config.value?.folders)

  function columnFor(current: TableMeta | undefined, spec: string | DetailFieldSpec) {
    return current?.columns.find((column) => column.name === specColumnName(spec))
  }

  /** First non-empty field from a nested fallback chain, plus its source column. */
  function firstContent(
    current: TableMeta | undefined,
    currentRow: Record<string, unknown>,
    groups: Array<string | DetailFieldSpec | Array<string | DetailFieldSpec>> | undefined,
  ): { value: unknown; column: ColumnMeta | undefined } | undefined {
    for (const group of groups ?? []) {
      for (const spec of Array.isArray(group) ? group : [group]) {
        const value = detailFieldValue(currentRow, spec)
        if (value === null || value === undefined || value === '') continue
        if (Array.isArray(value) && !value.length) continue
        return { value, column: columnFor(current, spec) }
      }
    }
    return undefined
  }

  function reset() {
    extrasSequence += 1
    lookupValue.value = undefined
    lookupColumn.value = undefined
    lookupLoading.value = false
    sourceItems.value = []
    folderItems.value = []
    childrenRows.value = []
    childrenTotal.value = 0
    childrenLoading.value = false
    childrenError.value = ''
  }

  async function loadLookup(currentRow: Record<string, unknown>, sequence: number) {
    const spec = lookupConfig.value
    if (!spec) return
    const key = currentRow[spec.column]
    if (key === undefined || key === null || key === '') return
    lookupLoading.value = true
    try {
      const targetColumn = spec.targetColumn ?? spec.column
      const columns = [
        ...new Set([targetColumn, ...spec.fields.map((field) => specColumnName(field))]),
      ]
      const response = await api.queryTable(spec.table, {
        columns,
        filters: [{ column: targetColumn, op: 'eq', value: key }],
        limit: 1,
      })
      if (sequence !== extrasSequence) return
      const found = response.rows[0]
      if (!found) return
      const content = firstContent(lookupTable.value, found, [spec.fields])
      if (!content) return
      lookupValue.value = content.value
      lookupColumn.value = content.column
    } catch {
      // The empty-text fallback is the same for missing and failed lookups.
    } finally {
      if (sequence === extrasSequence) lookupLoading.value = false
    }
  }

  async function loadSources(currentRow: Record<string, unknown>, sequence: number) {
    const configs = sourceConfigs.value
    if (!configs.length) return
    const rowsByTable = new Map<string, Array<Record<string, unknown>>>()
    await Promise.all(
      configs.map(async (source) => {
        const key = currentRow[source.column]
        if (key === undefined || key === null || key === '') return
        const targetColumn = source.targetColumn ?? source.column
        const columns = [
          ...new Set([targetColumn, ...(source.timeColumn ? [source.timeColumn] : [])]),
        ]
        try {
          const response = await api.queryTable(source.table, {
            columns,
            filters: [{ column: targetColumn, op: 'eq', value: key }],
            limit: 200,
          })
          if (sequence === extrasSequence) rowsByTable.set(source.table, response.rows)
        } catch {
          // A missing provenance table should not hide the main record.
        }
      }),
    )
    if (sequence !== extrasSequence) return
    sourceItems.value = sourceEntries(configs, rowsByTable, schema.value?.tables ?? [])
  }

  async function loadFolders(currentRow: Record<string, unknown>, sequence: number) {
    const spec = folderConfig.value
    if (!spec) return
    const key = currentRow[spec.linkColumn]
    if (key === undefined || key === null || key === '') return
    const linkTable = schema.value?.tables.find((item) => item.name === spec.linkTable)
    try {
      const linkColumns = [
        ...new Set([
          spec.linkTargetColumn,
          spec.linkKeyColumn,
          ...(spec.linkTimeColumn ? [spec.linkTimeColumn] : []),
        ]),
      ]
      const linkResponse = await api.queryTable(spec.linkTable, {
        columns: linkColumns,
        filters: [{ column: spec.linkTargetColumn, op: 'eq', value: key }],
        limit: 200,
      })
      if (sequence !== extrasSequence) return
      const folderKeys = [
        ...new Set(
          linkResponse.rows
            .map((row) => row[spec.linkKeyColumn])
            .filter((value) => value !== null && value !== undefined && value !== '')
            .map((value) => String(value)),
        ),
      ]
      if (!folderKeys.length) return
      const folderColumns = [
        ...new Set([
          spec.folderKeyColumn,
          ...spec.folderTitle.map((title) => specColumnName(title)),
        ]),
      ]
      const folderResponse = await api.queryTable(spec.folderTable, {
        columns: folderColumns,
        filters: [{ column: spec.folderKeyColumn, op: 'in', value: folderKeys }],
        limit: 200,
      })
      if (sequence !== extrasSequence) return
      const map = foldersBySourceKey(
        spec,
        linkResponse.rows,
        folderResponse.rows,
        linkTable,
      )
      folderItems.value = map.get(String(key)) ?? []
    } catch {
      if (sequence === extrasSequence) folderItems.value = []
    }
  }

  async function loadChildren(currentRow: Record<string, unknown>, sequence: number) {
    const spec = childrenConfig.value
    if (!spec) return
    const key = currentRow[spec.column]
    if (key === undefined || key === null || key === '') return
    childrenLoading.value = true
    childrenError.value = ''
    try {
      const targetColumn = spec.targetColumn ?? spec.column
      const columns = new Set<string>([targetColumn])
      for (const group of spec.content ?? []) {
        for (const item of Array.isArray(group) ? group : [group]) {
          columns.add(specColumnName(item))
        }
      }
      for (const item of [...(spec.title ?? []), ...(spec.meta ?? [])]) {
        columns.add(specColumnName(item))
      }
      const response = await api.queryTable(spec.table, {
        columns: [...columns],
        filters: [{ column: targetColumn, op: 'eq', value: key }],
        sort: spec.sort ? [spec.sort] : undefined,
        limit: spec.limit ?? 200,
      })
      if (sequence !== extrasSequence) return
      childrenRows.value = response.rows
      childrenTotal.value = response.total
    } catch (caught) {
      if (sequence !== extrasSequence) return
      childrenError.value = caught instanceof ApiError ? caught.message : String(caught)
    } finally {
      if (sequence === extrasSequence) childrenLoading.value = false
    }
  }

  async function load(currentRow: Record<string, unknown>) {
    const sequence = ++extrasSequence
    reset()
    await Promise.allSettled([
      loadLookup(currentRow, sequence),
      loadSources(currentRow, sequence),
      loadFolders(currentRow, sequence),
      loadChildren(currentRow, sequence),
    ])
  }

  function childKey(child: Record<string, unknown>, index: number): string {
    const current = childrenTable.value
    const key = current?.primary_key.map((name) => String(child[name] ?? '')).join('|')
    return key || String(index)
  }

  function childTitle(child: Record<string, unknown>, index: number): string {
    const value = firstDetailValue(child, childrenConfig.value?.title)
    return value === undefined || value === null || value === ''
      ? `第 ${index + 1} 条`
      : String(value)
  }

  function childMeta(child: Record<string, unknown>): string {
    const current = childrenTable.value
    if (!current) return ''
    return (childrenConfig.value?.meta ?? [])
      .map((spec) => {
        const text = specTextFor(current, child, spec)
        if (!text) return ''
        const label = typeof spec === 'object' ? spec.label : undefined
        return label ? `${label} ${text}` : text
      })
      .filter(Boolean)
      .join(' · ')
  }

  const childViews = computed(() =>
    childrenRows.value.map((child, index) => {
      const content = firstContent(
        childrenTable.value,
        child,
        childrenConfig.value?.content,
      )
      return {
        key: childKey(child, index),
        title: childTitle(child, index),
        meta: childMeta(child),
        contentValue: content?.value,
        contentColumn: content?.column,
      }
    }),
  )

  return {
    lookupConfig,
    lookupValue,
    lookupColumn,
    lookupLoading,
    sourceItems,
    folderItems,
    childrenConfig,
    childrenTotal,
    childrenLoading,
    childrenError,
    childViews,
    reset,
    load,
  }
}
