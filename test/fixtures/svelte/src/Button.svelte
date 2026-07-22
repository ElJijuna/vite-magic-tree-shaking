<script lang="ts">
// biome-ignore lint/correctness/noUnusedVariables: Svelte consumes this variable in the template.
let { label }: { label: string } = $props();
</script>

<button type="button">{label}</button>
