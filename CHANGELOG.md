# Changelog

## [1.0.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.23.2...gp-grid-v1.0.0) (2026-10-24)


### ⚠ BREAKING CHANGES

* **angular:** keep the entry to the component, the data helpers and the renderer types
* **vue:** keep the entry to the component, the composables and the core factories
* **core:** drop isSameDay and rawValueKey from the entry, document the filter helpers
* **vue:** render grouped header bands, number ARIA rows after the header, require Vue 3.5
* **core:** add nested column groups and core-owned header bands
* size row boxes from slot heights and smooth scaled scrolling in the wrappers
* **core:** set row heights by row identity with anchored scrolling
* render the Angular column window, pins and header toggle
* render the Vue column window, pins and header toggle
* render the React column window, pins and header toggle
* route wrapper input, scroll and peek x through the inline axis
* render pin headers and viewport-space drag overlays in the wrappers
* publish and seed the mounted column window
* consume core layout snapshots in wrappers
* route core rendering, input and paging through geometry

### ✨ Features

* 1.0 release qualification (PRD 011) ([d224a65](https://github.com/GioPat/gp-grid/commit/d224a652237f9832870f02fb19058b787960b5e3))
* add a pin icon and accessible pin toggle labels to the core ([6d23aef](https://github.com/GioPat/gp-grid/commit/6d23aefaf3064567b4b357f695d2aa90e54e82b8))
* add column model with id-keyed state and resolved layout ([9209b1a](https://github.com/GioPat/gp-grid/commit/9209b1a2bd03765fa3e06c3b7f63c0f56c5b0bfd))
* add live pin state, retention and region-aware input to the core ([b2fcf12](https://github.com/GioPat/gp-grid/commit/b2fcf1240d7bcbd279077a25cdfcc5c952aed5c1))
* add pin regions, the center window and region-aware geometry ([23d6595](https://github.com/GioPat/gp-grid/commit/23d65955aa49b9724a374696a1936e0f6d631f19))
* add read-only columnar data access ([1416da3](https://github.com/GioPat/gp-grid/commit/1416da36c68083105f5a3cf4a616817421d565d7))
* add read-only zero-copy columnar data sources ([6fce166](https://github.com/GioPat/gp-grid/commit/6fce1664df535977546839166eaa1d2f3e35652c))
* add virtual axis, column layout resolver and geometry service ([64d96d9](https://github.com/GioPat/gp-grid/commit/64d96d94510b87cc028243d7f3e5066e9afd67a9))
* **angular:** render frozen rows and adopt the namespaced core API ([77eb001](https://github.com/GioPat/gp-grid/commit/77eb0015e62b3521c3b4cfd954a992f5e0480307))
* **angular:** render grouped header bands and number ARIA rows after the header ([70335b5](https://github.com/GioPat/gp-grid/commit/70335b50062687cae23014901a43dc2114aeaef4))
* **angular:** render row and column edge handles with fit and row resize ([4f83800](https://github.com/GioPat/gp-grid/commit/4f8380081ac97f65aebfd57b56f80c01ce765470))
* bounded server grouping (PRD 009) ([efd5dbf](https://github.com/GioPat/gp-grid/commit/efd5dbf78511ec0e6c345f43a54dc71cded45c9b))
* change-proportional transaction refresh (PRD 015) ([87a3545](https://github.com/GioPat/gp-grid/commit/87a3545ea147a61a0457debf23bf07359eaf443b))
* consume core layout snapshots in wrappers ([b8e1896](https://github.com/GioPat/gp-grid/commit/b8e1896ccbb306104013a66da4937dbcc1be6819))
* **core,react,vue,angular:** render group rows in the wrappers ([1e268de](https://github.com/GioPat/gp-grid/commit/1e268de704aea1903ea44db967a4a65cdb5d771e))
* **core:** add createColumnGroupLookup to resolve group definitions before the core exists ([f35cca3](https://github.com/GioPat/gp-grid/commit/f35cca34b6504fc0733a55b8748b87bf3e86a056))
* **core:** add frozen rows and group the GridCore API into namespaces ([b46b610](https://github.com/GioPat/gp-grid/commit/b46b61027842fc3b5b7295f705d6022cd924f33c))
* **core:** add group header helpers, columns.getGroup and one size/window instruction per band batch ([6628131](https://github.com/GioPat/gp-grid/commit/66281314613d68e913af8feea04e156540a12aa3))
* **core:** add nested column groups and core-owned header bands ([9998a8b](https://github.com/GioPat/gp-grid/commit/9998a8b27903d317a1259333d20891026af0c49f))
* **core:** add row resize, one-shot fit and grid resize keys ([c04d8b4](https://github.com/GioPat/gp-grid/commit/c04d8b4ab5f349c845cd8bf0caa3e98ac231d606))
* **core:** bounded undo and redo over the write commands, by record id ([b78afbd](https://github.com/GioPat/gp-grid/commit/b78afbd6c0dfef1961b02b8ed3096f84abdec1f3))
* **core:** createPivotSource, the local pivot engine ([d9e083b](https://github.com/GioPat/gp-grid/commit/d9e083bb428fc2407054b22faeb5d2b925cc781d))
* **core:** export FlatRowSource and reword the grouping rejection warning ([06102df](https://github.com/GioPat/gp-grid/commit/06102df9adea52b56d8ddb7ae0dfbb5d32cdeb1b))
* **core:** hierarchical rows, expansion commands and group write guards ([6ae7df4](https://github.com/GioPat/gp-grid/commit/6ae7df4a271fb2d64f85af82405b064f851d305e))
* **core:** let a touch fling adopt scroll corrections made mid-flight ([eeb6e2f](https://github.com/GioPat/gp-grid/commit/eeb6e2fddebf311d1d91075133c445e600b7dc03))
* **core:** local row grouping engine ([2e9e67e](https://github.com/GioPat/gp-grid/commit/2e9e67ea5cdcff25f85d53d8406914472b4fc6a0))
* **core:** one onWriteCommitted per write command, paste skips reported ([e557e79](https://github.com/GioPat/gp-grid/commit/e557e79fd53eae84984fb5517326f74e62ea5d9e))
* **core:** pivot schema helper, generated ids and childless group rows ([910139a](https://github.com/GioPat/gp-grid/commit/910139aebb748e28552670ed9a9308c2683c54de))
* **core:** server grouping source, lazy hierarchy hooks and mock service ([6530e24](https://github.com/GioPat/gp-grid/commit/6530e24de7202ef61b6e36e1a8f660670f0560bb))
* **core:** set row heights by row identity with anchored scrolling ([986305b](https://github.com/GioPat/gp-grid/commit/986305b5e86a01f7f35eb97c1092d5511fbaad9f))
* **core:** share the row-group markup helpers, isMutableDataSource and setHierarchical ([60bf085](https://github.com/GioPat/gp-grid/commit/60bf08578c84b1abd7cebbac4044b6571f6a4e59))
* **core:** transaction change details and an update refresh without a query ([1107639](https://github.com/GioPat/gp-grid/commit/110763906f45d5e60be4d71206ce4d4a0fe2b1d2))
* enable pinning icon (round robin pinnin) ([68f643e](https://github.com/GioPat/gp-grid/commit/68f643e7b462ca5b9bce897d19039a8fbcad2ccb))
* export the pin and window types from the core entry ([5d709a1](https://github.com/GioPat/gp-grid/commit/5d709a19a2898b649ebf3575478fd52f337b0572))
* expose onWriteRejected and columnar exports in wrappers ([289917e](https://github.com/GioPat/gp-grid/commit/289917edd9f865587e7db0b923fbb1d8cd6d5f80))
* normalize the inline axis in core adapters and input ([66071dd](https://github.com/GioPat/gp-grid/commit/66071ddae381bad77d482db7e5a6f5d644176db6))
* **playgrounds:** format the pivot demo's salary and average age ([afe7095](https://github.com/GioPat/gp-grid/commit/afe7095482760d2f551192a98a5c4c8e51807362))
* **playgrounds:** give the Angular demo status and salary fields ([88ab641](https://github.com/GioPat/gp-grid/commit/88ab641dab33291f9eafca325c27a7a89bcdf839))
* **playgrounds:** history and the write event in the three demos; widen the writes arm's core getter ([ee32866](https://github.com/GioPat/gp-grid/commit/ee32866c7743004a7dcebc8fd30da88abd6b0d5f))
* **playgrounds:** pivot the demo by creation month ([1993169](https://github.com/GioPat/gp-grid/commit/1993169619948e20cbac8b7aed14c05503c30ed2))
* **playgrounds:** show the id column in the Vue demo ([cf01e9c](https://github.com/GioPat/gp-grid/commit/cf01e9ce30dac07a124ba438dc05055548450b8e))
* publish and seed the mounted column window ([74b5dd5](https://github.com/GioPat/gp-grid/commit/74b5dd52a153a44de58b99f432c10ac918043011))
* **react,vue,angular:** history option; undo browser cases and the SSR write check ([14387f1](https://github.com/GioPat/gp-grid/commit/14387f11fea8b978e581daa3ba615e8c53042249))
* **react,vue,angular:** onWriteCommitted; conformance writes arm and spec ([317dc55](https://github.com/GioPat/gp-grid/commit/317dc5538552ebf947c69f622dea9b94c3c9f80d))
* **react,vue,angular:** pass the transaction result to refreshFromTransaction ([0d83c65](https://github.com/GioPat/gp-grid/commit/0d83c656fd2a9997874bd5d24e6621c6bcc3396d))
* **react,vue,angular:** re-export createPivotSource ([9916d85](https://github.com/GioPat/gp-grid/commit/9916d853b83a9de4f5ff6cb5c8f137584c1f24c8))
* **react,vue,angular:** re-export the pivot schema helper and types ([00830d3](https://github.com/GioPat/gp-grid/commit/00830d31f8ed2cc99547d5f82a1fa5eadf71aefa))
* **react,vue,angular:** render placeholders and failed groups, re-export server grouping ([5183cbb](https://github.com/GioPat/gp-grid/commit/5183cbb1a9bbac5525460f871ff749fcad11453f))
* **react:** render frozen rows and adopt the namespaced core API ([8a02f01](https://github.com/GioPat/gp-grid/commit/8a02f0173196e08b0a0069a773fc5ff9edb802b3))
* **react:** render grouped header bands and number ARIA rows after the header ([f886eb3](https://github.com/GioPat/gp-grid/commit/f886eb3d53512d3e9b271bf89a5bb352b84283d9))
* **react:** render row and column edge handles with fit and row resize ([83f1c37](https://github.com/GioPat/gp-grid/commit/83f1c377a54672e8c27a6969d11a9911db9b7b49))
* read-only pivot (PRD 012) ([54b7846](https://github.com/GioPat/gp-grid/commit/54b784661faca60231ecf2dabedcf4471ee2e3ae))
* reconcile schema, rows and edits by identity in core ([1f8adbe](https://github.com/GioPat/gp-grid/commit/1f8adbe0b9b16e7ab646184221ca203ffa0d0b90))
* render pin headers and viewport-space drag overlays in the wrappers ([021983b](https://github.com/GioPat/gp-grid/commit/021983b6c4e681e0c818f00140be58e1ba295189))
* render the Angular column window, pins and header toggle ([8a421ac](https://github.com/GioPat/gp-grid/commit/8a421ac1caed618934cbd192d5c6572d2b75a869))
* render the React column window, pins and header toggle ([a74868a](https://github.com/GioPat/gp-grid/commit/a74868a55e154e324a6d99db613fdcbc53099689))
* render the Vue column window, pins and header toggle ([954ea63](https://github.com/GioPat/gp-grid/commit/954ea63357906951d555181c5ddacbc9ff204dd5))
* report write rejections per operation ([e2aab65](https://github.com/GioPat/gp-grid/commit/e2aab65d85a08df6e5531293104a703cfb446119))
* route core rendering, input and paging through geometry ([ba24604](https://github.com/GioPat/gp-grid/commit/ba24604d0d2c45af0c21f50cfcf46ef2231bac88))
* route wrapper input, scroll and peek x through the inline axis ([ec219aa](https://github.com/GioPat/gp-grid/commit/ec219aa0c0aac77a59f34c30f7173718f08fca9d))
* size row boxes from slot heights and smooth scaled scrolling in the wrappers ([c49035d](https://github.com/GioPat/gp-grid/commit/c49035d7af802e078b717c4901e0df456bd4ccd1))
* sync columns and column state through wrappers with object events ([d382cce](https://github.com/GioPat/gp-grid/commit/d382cce8e31fa83b79ce0f709f6bb19eb284c9c9))
* **vue:** render frozen rows and adopt the namespaced core API ([fa1d940](https://github.com/GioPat/gp-grid/commit/fa1d94083d86f35eea0230dd3f75cd765a2a9d81))
* **vue:** render grouped header bands, number ARIA rows after the header, require Vue 3.5 ([0bef9c2](https://github.com/GioPat/gp-grid/commit/0bef9c20704b584fc5a9460448b88890e4091e7f))
* **vue:** render row and column edge handles with fit and row resize ([49792a1](https://github.com/GioPat/gp-grid/commit/49792a1f9b2dc83d550ff6005f39507a120c3715))
* write commands and bounded history (PRD 013) ([99d333b](https://github.com/GioPat/gp-grid/commit/99d333b28f2ce320b3584533b10c0e24a8165bfe))


### 🐛 Bug Fixes

* **angular:** normalise an undefined dataSource input ([eb6e20c](https://github.com/GioPat/gp-grid/commit/eb6e20cc4426ddbe5bf12d1718d79963f1b9238e))
* **angular:** tolerate an undefined dataSource input ([03bd24b](https://github.com/GioPat/gp-grid/commit/03bd24bfac8d161e99014e71a02394c3990e51bc))
* clamp column moving ghost to viewport ([6486d1d](https://github.com/GioPat/gp-grid/commit/6486d1d4880f4a22a7efb5329c25a2579232aeef))
* column fit measures values only ([16d25db](https://github.com/GioPat/gp-grid/commit/16d25dbd9110bce0e2154676e4318528d167e827))
* core quality gate on the 1.0 line ([a2cfc93](https://github.com/GioPat/gp-grid/commit/a2cfc9368cea3da95f19187b03c1bc39b8473339))
* **core,react,vue,angular:** stop scroll motion on press and smooth scaled wheel scrolling ([21f9a07](https://github.com/GioPat/gp-grid/commit/21f9a0765b3ee7c71e28d4a9bb3d822a10dc56a9))
* **core:** a column fit measures the body cells only, never the header ([836628d](https://github.com/GioPat/gp-grid/commit/836628d3ac77af5ef797eb3d56d4f38373da512c))
* **core:** address the SonarCloud findings in the pivot engine ([aaf994d](https://github.com/GioPat/gp-grid/commit/aaf994d019676fd69d467c5c0870fa40f7ccbace))
* **core:** address the SonarQube findings in the server grouping engine ([d36d7b1](https://github.com/GioPat/gp-grid/commit/d36d7b1a45860cbe606a1e470d110cd96631da08))
* **core:** coerce edit commits by column cellDataType ([bbbcaaa](https://github.com/GioPat/gp-grid/commit/bbbcaaa77cacd2c6efd50a4190490c4457c93e22))
* **core:** fling the inline axis on a touch release ([37609cb](https://github.com/GioPat/gp-grid/commit/37609cba6541991ea0724f753a9a5203d6d1405b))
* **core:** follow the active cell's column by id through a hierarchy reload ([d08bc55](https://github.com/GioPat/gp-grid/commit/d08bc55792b37c02d1425dd92bdd59eec243c89b))
* **core:** ignore the click and double-click of a press that stopped scroll motion ([f151e61](https://github.com/GioPat/gp-grid/commit/f151e61102866a65308e07d6e1327cae86a441cc))
* **core:** mark the clipboard copy's promise as ignored in the keyboard handler ([fc2ab1b](https://github.com/GioPat/gp-grid/commit/fc2ab1bfeada32c1f8d2f7c93bf88afdeb4c1139))
* **core:** paint the loader before a large columnar sort ([1322a98](https://github.com/GioPat/gp-grid/commit/1322a983394d51d69d06c555d17045ce88581463))
* **core:** paint the loader before a large columnar sort ([0d856c5](https://github.com/GioPat/gp-grid/commit/0d856c5342beac0792cd10508ddededef9ab55f7))
* **core:** pivot label column unfilterable, rowTotalsHeader, source reusable after destroy ([69a6f71](https://github.com/GioPat/gp-grid/commit/69a6f7186c5152f0f0a15bc352934b0f8173fb41))
* **core:** report a terminal group's leaf count as its childCount ([8e6d7fc](https://github.com/GioPat/gp-grid/commit/8e6d7fc2de54d156af9905a5cac580bda883bb65))
* mark floating promises, hide decorative header icons, focus the editor through a ref ([41399c2](https://github.com/GioPat/gp-grid/commit/41399c254e50bee3dcd0b65a2af4aa82e39ed5a7))
* name the project in angular playground scripts ([9e7015c](https://github.com/GioPat/gp-grid/commit/9e7015c4d1622a4f8d7c618eb91b29843e659f5b))
* **playground:** keep the Vite button reset off the grid's own controls ([08eadee](https://github.com/GioPat/gp-grid/commit/08eadee13cfd5b6840f94ffe4622fa3fc7ceeb02))
* **react,vue:** keep a SCROLL_TO correction until the adapter writes it ([b2eed2a](https://github.com/GioPat/gp-grid/commit/b2eed2a08b4ddd2a692d00e707399fe5671e10ef))
* **react:** render group header names, wrap and renderers before the core mounts ([cd7fbe0](https://github.com/GioPat/gp-grid/commit/cd7fbe03440ac72b668e8b0d0c1aa5eb2026f4e0))
* rebind a data source swapped at runtime ([587bc2e](https://github.com/GioPat/gp-grid/commit/587bc2ef10488d726372404abfae83fa3f195061))
* reject invalid columnar source guards ([fbc6b87](https://github.com/GioPat/gp-grid/commit/fbc6b87917b0373d1ec502e068cf7778c4aea017))
* resolve angular type-check failures ([3f3de53](https://github.com/GioPat/gp-grid/commit/3f3de53fe90ea4dba6bf1c99e99464f29535e6cb))
* return the keyboard focus to the grid when an editor closes ([c48be10](https://github.com/GioPat/gp-grid/commit/c48be109a50dd4349b0063f3a6282aefa3ee9c22))
* **vue,angular:** wrapper data source lifecycle ([913e4a5](https://github.com/GioPat/gp-grid/commit/913e4a566056c48b3fbb3885f74f3c53d255370f))
* **vue:** bind the grouped row attributes one by one beside the string style ([1704592](https://github.com/GioPat/gp-grid/commit/17045923e9802cea477e578a1ff792807872a41e))
* **vue:** render group header names, wrap and renderers before the core mounts ([0f7b1a6](https://github.com/GioPat/gp-grid/commit/0f7b1a66e1ec42fb16e2ec01a33ebe745917dfb8))


### ⚡Performance

* clone batch maps copy-on-write so a window-only batch skips re-render ([4702fc0](https://github.com/GioPat/gp-grid/commit/4702fc0a49f4c1fd6802222c79b2411949f35dda))
* **core:** iterative group id helpers so the flat bundle drops the engine ([9cd3d9d](https://github.com/GioPat/gp-grid/commit/9cd3d9d83885262c2aa084187d7fd7487c06c6d9))


### ♻️ Refactoring

* **angular:** adopt the core row-group helpers ([8f57d80](https://github.com/GioPat/gp-grid/commit/8f57d80536c8fb2a0f72f6040ec94cf7b739b2d5))
* **angular:** keep the entry to the component, the data helpers and the renderer types ([059a28d](https://github.com/GioPat/gp-grid/commit/059a28d0498aaa89d129932f514b7fe91c4b65e4))
* **core:** back row geometry with an override-capable virtual axis ([0de9fd7](https://github.com/GioPat/gp-grid/commit/0de9fd74493d5a033d8b361b01a44dfb88f77dc0))
* **core:** drop isSameDay and rawValueKey from the entry, document the filter helpers ([ad92109](https://github.com/GioPat/gp-grid/commit/ad9210986420c3a0f4bb6769cb8b251c17efea9d))
* **core:** extract the motion gate and gate presses on the wheel glide only ([738b580](https://github.com/GioPat/gp-grid/commit/738b5801097912af4066b95d3b3e4cf66581223e))
* **core:** make RowGrouping opaque and move the expansion depth on expand-all ([340e0e4](https://github.com/GioPat/gp-grid/commit/340e0e4e55d5342c77ae70ec20e7fe0c0439a939))
* **core:** move flat row cache and access into FlatRowStore ([b0143dc](https://github.com/GioPat/gp-grid/commit/b0143dc23d0c94163bf669399f531f86cd76a211))
* **core:** move the row locator out of the row store, trim three docblocks ([db3de82](https://github.com/GioPat/gp-grid/commit/db3de8279155c720960c88d2d8e029f54d2582bb))
* **core:** route every write through one gate and report unconvertible edits ([dcdf395](https://github.com/GioPat/gp-grid/commit/dcdf39510377747157ffa3db52f1f469832293ca))
* **core:** share the grouping tree, aggregators and expansion under hierarchy/ ([b1cb95b](https://github.com/GioPat/gp-grid/commit/b1cb95b0ea255555abe402a46f80b8853533b3af))
* **core:** sort owned headers in a separate statement ([b203cdf](https://github.com/GioPat/gp-grid/commit/b203cdf56b921c470c730e298d9f8a8b1b23a6ae))
* **core:** split page reservation and share numeric guards ([0d64ed2](https://github.com/GioPat/gp-grid/commit/0d64ed2ed01306cbf7a6ed2db2876df75c3ae57c))
* **core:** split RowStore.locateIds by storage kind ([aff3931](https://github.com/GioPat/gp-grid/commit/aff3931913a075c6b946836e0619e4199942c2c5))
* **core:** split the Ctrl shortcuts out of the keyboard handler's typing branch ([dbf8f4e](https://github.com/GioPat/gp-grid/commit/dbf8f4e4c67694aea64efcf3c2aa3fec563e913b))
* **core:** split the transaction queue's apply and settle steps, merge an import ([e9c0250](https://github.com/GioPat/gp-grid/commit/e9c0250d790cfde0a54a1b13b192ebbbaea3ea3e))
* **core:** trim the flat bundle ([ac095fb](https://github.com/GioPat/gp-grid/commit/ac095fb88cf501aa645bcc6d3687b2dbf7479cde))
* drop ColumnId alias and address code quality findings ([1a39b58](https://github.com/GioPat/gp-grid/commit/1a39b5823837dd726661dfbdc7b0e259b91c71bb))
* extract distinct-value collection from sort-filter manager ([6539048](https://github.com/GioPat/gp-grid/commit/653904869684a7c45302b8a4e8ab23cd67d9ab45))
* **playgrounds:** group the conformance controls into sections ([415fbcb](https://github.com/GioPat/gp-grid/commit/415fbcb90c162fdc59bbb0c050d5dd171d5491e3))
* **react:** adopt the core row-group helpers ([ba8039b](https://github.com/GioPat/gp-grid/commit/ba8039b66f5db7e95acf7782d3be8fb16f46b442))
* share size-change resync and validation helpers ([1069750](https://github.com/GioPat/gp-grid/commit/1069750c94a1a9d6ab43e5b964c4652b287608fb))
* simplify geometry clamps and drop unused row mapper accessors ([f63bc98](https://github.com/GioPat/gp-grid/commit/f63bc98591bb42a8b246b436b2af6322f2dce24f))
* split the React cell, row and header markup into components ([77c8ca1](https://github.com/GioPat/gp-grid/commit/77c8ca1f1e99124c934180dff5f50c75a4d0bc1f))
* **vue:** adopt the core row-group helpers and expose the cell context headless ([8a26a11](https://github.com/GioPat/gp-grid/commit/8a26a114914f96abcf632a1abf8f93e35afaa605))
* **vue:** keep the entry to the component, the composables and the core factories ([9d3a48b](https://github.com/GioPat/gp-grid/commit/9d3a48b4f072e8c402be3eadee13464eac69fecc))


### 📝 Documentation

* a server-computed pivot is supplied precomputed, no pivot over the grouping service ([86847cc](https://github.com/GioPat/gp-grid/commit/86847cc62a54364615edfa4bdb95c29565306791))
* add accessibility and file size rules to AGENTS.md ([3dc5a7e](https://github.com/GioPat/gp-grid/commit/3dc5a7ea637555a729163fcbc6d304cb394082bb))
* browsers and keyboard in the migration guide ([4584583](https://github.com/GioPat/gp-grid/commit/45845839c2a73cefd03128ad2d235b455ca23466))
* document column layout modes and the geometry API ([1beb044](https://github.com/GioPat/gp-grid/commit/1beb044fd7366426b891a3fc7917ff106fa482ef))
* document column pinning, the mounted window and the migration ([5f9d033](https://github.com/GioPat/gp-grid/commit/5f9d0332fbb9c4b8bcc260d60f1612fcecda8fbe))
* document column state, identity events and edit sessions ([809eabd](https://github.com/GioPat/gp-grid/commit/809eabdeb34ef84d7f94bcc95e7ff6ee25755e33))
* document columnar source and revision contracts ([478cd0e](https://github.com/GioPat/gp-grid/commit/478cd0ef00aa005b928dc051dd37e9957eefaead))
* document frozen rows and the GridCore namespaces ([b327f22](https://github.com/GioPat/gp-grid/commit/b327f22a75c541fa08ab2278acefbff7c70ea6e5))
* document row heights ([48246c6](https://github.com/GioPat/gp-grid/commit/48246c61c03b894ac2bac3d292f48f2b75b5289b))
* document row resize, auto-fit and column groups ([690e557](https://github.com/GioPat/gp-grid/commit/690e557f9f62924555b656604dd212689bd5a24f))
* document write rejection operations ([d63f567](https://github.com/GioPat/gp-grid/commit/d63f567ae592887ee16dc37dc6042f00747f32cc))
* known limitations and a framework-neutral index ([4c01784](https://github.com/GioPat/gp-grid/commit/4c017848339b44293f1a5d5a2ad7125a74ec0d08))
* migration guide from 0.23.x ([b03b405](https://github.com/GioPat/gp-grid/commit/b03b405678dddf12f5ffb021a37974333c8705f2))
* opaque RowGrouping, expandedDepth, type-mismatch and the shared row-group helpers ([116c059](https://github.com/GioPat/gp-grid/commit/116c05906cab01cc0017970deabf644a98946f8c))
* pivot feature page, READMEs, skill and changelog ([87b091d](https://github.com/GioPat/gp-grid/commit/87b091d7d83aa93753045d1e56cfbedb5069face))
* row grouping feature page, READMEs, skill and changelog ([4ac3b23](https://github.com/GioPat/gp-grid/commit/4ac3b236ca9e5452bc06c517b34af90ff4da01a0))
* server grouping feature page, READMEs, skill and changelog ([bd88519](https://github.com/GioPat/gp-grid/commit/bd88519af2cad451a948a3e256ddbe53a6ecd424))
* **skill:** editor focus and the keyboard limits of 1.0 ([6a1b188](https://github.com/GioPat/gp-grid/commit/6a1b188d15dd2952678f3cc2731f2843f9f52249))
* **skill:** round computed numbers in valueFormatter ([c2d375d](https://github.com/GioPat/gp-grid/commit/c2d375d4717bddbf640c8c24c534edc9e17c2fbc))
* **skills:** specify details to avoid pinning overlay ([39c503a](https://github.com/GioPat/gp-grid/commit/39c503a91df29a9233b0daafd4c2dedc94926a61))
* state the pivot id format as a compatibility promise ([71a07b6](https://github.com/GioPat/gp-grid/commit/71a07b6a6676dff1679be92f8217d46a67ada7c3))
* the 1.0.0 changelog block ([e0a695e](https://github.com/GioPat/gp-grid/commit/e0a695ee7a86b8009f965646e887cda18c5f4592))
* the one-off browser results in the migration guide ([2f224e1](https://github.com/GioPat/gp-grid/commit/2f224e17c6eacf00184ad4c2442842f00b5c1cc7))
* update docs with pinning support ([70c7e1c](https://github.com/GioPat/gp-grid/commit/70c7e1c9b2d7e3383f26b6109c783cd9c721390a))
* write commands and history, the paste skips and the flat consumer with history ([20552d5](https://github.com/GioPat/gp-grid/commit/20552d5d406ed265130489232a4a09452bd9d293))

## [0.23.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.23.1...gp-grid-v0.23.2) (2026-09-07)


### 🐛 Bug Fixes

* refresh from transactions trigger DATA_LOADED ([119b3ac](https://github.com/GioPat/gp-grid/commit/119b3ac344dbb6388cca36753cb9177c2128d3a1))

## [0.23.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.23.0...gp-grid-v0.23.1) (2026-08-31)


### 🐛 Bug Fixes

* disambiguate filters condition by adding groups ([2f9cc6a](https://github.com/GioPat/gp-grid/commit/2f9cc6a6288b20f7166d3c4a1315775da2990c61))
* disambiguate filters condition by adding groups ([64d202c](https://github.com/GioPat/gp-grid/commit/64d202c73c6a1edf9e4283791e0be1ea085a29f7))

## [0.23.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.22.0...gp-grid-v0.23.0) (2026-08-29)


### ⚠ BREAKING CHANGES

* the symbols above are no longer exported from @gp-grid/core. Use the GridCore facade (selection, fill, highlight, sortFilter) and the data-source factories instead.

### 🐛 Bug Fixes

* clear highlight caches when a column is moved ([348a155](https://github.com/GioPat/gp-grid/commit/348a15549159561ec8af58f8fa1252f5184f7100))
* nest InstructionBatcher start/flush as documented ([b3b6e87](https://github.com/GioPat/gp-grid/commit/b3b6e877ffc5284e7176214a3154f6fdec1d7664))


### ♻️ Refactoring

* drop internal managers and sorting internals from the public API ([283348d](https://github.com/GioPat/gp-grid/commit/283348d453937f6ed4076d3fc3cd388df1da7c23))
* route every view update through a single ViewSync ([e4f5fa2](https://github.com/GioPat/gp-grid/commit/e4f5fa24bff69f358b5b81c652508414c6fa89d4))

## [0.22.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.21.0...gp-grid-v0.22.0) (2026-08-28)


### ⚠ BREAKING CHANGES

* convert CSS style from inline TS to pure CSS, minifies worker code

### ♻️ Refactoring

* convert CSS style from inline TS to pure CSS, minifies worker code ([601b6d2](https://github.com/GioPat/gp-grid/commit/601b6d2851189144e0a4f072bf331418ac0f3600))

## [0.21.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.20.0...gp-grid-v0.21.0) (2026-08-15)


### ✨ Features

* allow replacing grid labels with custom ones ([bc7f99e](https://github.com/GioPat/gp-grid/commit/bc7f99ef87c2a898c55dd020c7565e1fee33a6a2))
* allow replacing grid labels with custom ones ([9f98924](https://github.com/GioPat/gp-grid/commit/9f9892444b1b852f0e07ff933dd703d80f316468))

## [0.20.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.19.0...gp-grid-v0.20.0) (2026-07-28)


### ⚠ BREAKING CHANGES

* **filtering:** TextFilterCondition.selectedValues is now Set<CellValue> containing raw values, not formatted labels. Server backends matching against formatter output must compare raw values instead; persisted filter models built from labels no longer match.

### ✨ Features

* **filtering:** store raw values in values-mode filter model ([4dda741](https://github.com/GioPat/gp-grid/commit/4dda741ff238d193d6f47279d6b9e6ba1c3eed9d))

## [0.19.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.18.0...gp-grid-v0.19.0) (2026-07-13)


### ✨ Features

* increase (and make it customizabile) max fling velocity ([36bd6b1](https://github.com/GioPat/gp-grid/commit/36bd6b146ee5b9baa09ed12991717cf28ff36a79))


### 🐛 Bug Fixes

* benchmark filtering when running bench cmd ([3bbb36f](https://github.com/GioPat/gp-grid/commit/3bbb36f518fe614d3576d0d1f05e2f2b8cb75d69))
* make sorting tie-breaker deterministic ([c5897bb](https://github.com/GioPat/gp-grid/commit/c5897bbc4a54256acf29243236b6f545f6dc78b9))
* virtual scrolling behavior on safari ([2fd6c82](https://github.com/GioPat/gp-grid/commit/2fd6c82c2e9648ab96071d4c92c4bd065917bc57))


### ⚡Performance

* avoid distinct value for some columns ([3a22c58](https://github.com/GioPat/gp-grid/commit/3a22c585c5aab0caddbd48e11b894b97339bc33a))

## [0.18.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.17.0...gp-grid-v0.18.0) (2026-06-18)


### ✨ Features

* smooth scrolling when activating the virtual dampening ([6672e65](https://github.com/GioPat/gp-grid/commit/6672e655beb809a6d4553195e359ed5cfe083d00))


### ♻️ Refactoring

* small refactor to reduce code smells. ([681c784](https://github.com/GioPat/gp-grid/commit/681c784d1531c367228ae3850093994024e6d431))

## [0.17.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.16.1...gp-grid-v0.17.0) (2026-05-24)


### ✨ Features

* move all non critical styles into `:where` ([1381312](https://github.com/GioPat/gp-grid/commit/1381312b5c91927111c1f0b986cfa8cdb8b90e41))
* peek and tooltip capability ([6e76060](https://github.com/GioPat/gp-grid/commit/6e76060407e4ac34f23bc135f3540df52555b67e))


### 🐛 Bug Fixes

* now gp-grid scan for all rows O(n), user can provide distinct values. ([e33f696](https://github.com/GioPat/gp-grid/commit/e33f696832a5af9f05964851dac2aa2ad5b9fe6f))

## [0.16.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.16.0...gp-grid-v0.16.1) (2026-05-15)


### 🐛 Bug Fixes

* enable overflow for filters popup ([a421da9](https://github.com/GioPat/gp-grid/commit/a421da9f7c305acf06ccb49577c0b92e43f729b4))
* resizing now honors the user selection ([13f80af](https://github.com/GioPat/gp-grid/commit/13f80af8f39878397074e73fe76e5a9e301a6631))
* scrolliing keeps the filter popup sticking ([893f1da](https://github.com/GioPat/gp-grid/commit/893f1da2afb6f62861f8bf1b703edea4f5edfa8e))


### ♻️ Refactoring

* remove useless castings ([2add130](https://github.com/GioPat/gp-grid/commit/2add13099996ea0dcc42b6fe885ac46772318093))

## [0.16.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.15.0...gp-grid-v0.16.0) (2026-05-12)


### ⚠ BREAKING CHANGES

* Change from `fetch` to `query`

### ✨ Features

* Change from `fetch` to `query` ([11f9a2c](https://github.com/GioPat/gp-grid/commit/11f9a2c2f97099dfe836cf0714f77d183f494dd9))

## [0.15.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.14.0...gp-grid-v0.15.0) (2026-05-11)


### ✨ Features

* improve Server Side pagination ([fe05105](https://github.com/GioPat/gp-grid/commit/fe05105730631465f5e2d8cd4fa24565ec587b2e))
* improve Server Side pagination ([0dde700](https://github.com/GioPat/gp-grid/commit/0dde700dc5d6c79e3854557fe9fc5923c5b8f1c5))

## [0.14.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.13.2...gp-grid-v0.14.0) (2026-05-07)


### ✨ Features

* apply matrix-based copy-paste ([2b682dd](https://github.com/GioPat/gp-grid/commit/2b682dd2158a30daeeaecbe6035da33ff703d028))

## [0.13.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.13.1...gp-grid-v0.13.2) (2026-04-29)


### 🐛 Bug Fixes

* make copy consistent to valueFormatting ([6f9c190](https://github.com/GioPat/gp-grid/commit/6f9c190377eb346c82fcdc212d2fd549349aa74a))

## [0.13.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.13.0...gp-grid-v0.13.1) (2026-04-24)


### 🐛 Bug Fixes

* formatValue before passing to cellRenderer ([ab02846](https://github.com/GioPat/gp-grid/commit/ab02846baab3ccf582668528a14098d20e948f76))

## [0.13.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.12.2...gp-grid-v0.13.0) (2026-04-24)


### ✨ Features

* **angular:** add injectable GridDataService ([075d35c](https://github.com/GioPat/gp-grid/commit/075d35cab9dd2486cddf83d90f090ff70f51c50f))

## [0.12.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.12.1...gp-grid-v0.12.2) (2026-04-23)


### 🐛 Bug Fixes

* **angular:** change detection strategy from eager to OnPush ([58485ce](https://github.com/GioPat/gp-grid/commit/58485ce7963891c3f4aa1e67c69752eb26322de9))

## [0.12.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.12.0...gp-grid-v0.12.1) (2026-04-23)


### 🐛 Bug Fixes

* enable filter value formatted ([879435d](https://github.com/GioPat/gp-grid/commit/879435d28d428677ae771f27e8bfceeed214e2bd))

## [0.12.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.11.3...gp-grid-v0.12.0) (2026-04-22)


### ✨ Features

* **vue:** support SFC for custom renderers ([9f29705](https://github.com/GioPat/gp-grid/commit/9f297053d53f05e13cd88b71ac6dfe41f52240aa))

## [0.11.3](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.11.2...gp-grid-v0.11.3) (2026-04-21)


### 🐛 Bug Fixes

* **core:** Remove enforcing of uppercase ([1ab458d](https://github.com/GioPat/gp-grid/commit/1ab458d7cf190e49d1c08d2ac974ea188e9f8477))

## [0.11.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.11.1...gp-grid-v0.11.2) (2026-04-20)


### 📝 Documentation

* **angular:** remove gp-core as peer dependency ([6361574](https://github.com/GioPat/gp-grid/commit/63615746950e9bface4713b86288b0ecb359ac40))

## [0.11.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.11.0...gp-grid-v0.11.1) (2026-04-20)


### 🐛 Bug Fixes

* trigger release ([7c293d3](https://github.com/GioPat/gp-grid/commit/7c293d3a3321307d1b1738ccccf6c21bb1022105))

## [0.11.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.10.3...gp-grid-v0.11.0) (2026-04-20)


### ⚠ BREAKING CHANGES

* remove injectStyle and expose styles.

### ✨ Features

* angular wrapper ([7b9d06b](https://github.com/GioPat/gp-grid/commit/7b9d06b2046aa57e841e3fc02748f9776bd0641e))


### 🐛 Bug Fixes

* **angular:** move core in deps ([51a3184](https://github.com/GioPat/gp-grid/commit/51a3184bebcbb86267d1812f9743a7234de9fa17))
* **core:** small typing issue ([c039d18](https://github.com/GioPat/gp-grid/commit/c039d18b26cbcc68fb5a6e2c6ea8c822c7df351c))
* distinct values counters ([11e633a](https://github.com/GioPat/gp-grid/commit/11e633ab875d5b79df9b10c6dc8d924bf388fd52))
* refresh regardless of the pagination ([c4abfcd](https://github.com/GioPat/gp-grid/commit/c4abfcd5af8bd3795cbc73a8e6767694189b5c5e))
* remove injectStyle and expose styles. ([7708442](https://github.com/GioPat/gp-grid/commit/7708442c4815f009ae0228b1d47267bc6654be06))
* scrolling mechanism ([cdf5bdf](https://github.com/GioPat/gp-grid/commit/cdf5bdfef7184ec58b2b102f3e836b4378312b03))


### ♻️ Refactoring

* **angular:** improve code ([4ab5460](https://github.com/GioPat/gp-grid/commit/4ab546006e095a31ff7b3521e2bc720758e3c043))
* avoid empty catches ([4bcb1bf](https://github.com/GioPat/gp-grid/commit/4bcb1bf28b3d16c64d5a4d582b3fe041090ff974))
* **core:** code quality imprvements ([ef09d74](https://github.com/GioPat/gp-grid/commit/ef09d7440e960b944bd0f4274a219f0428c25145))


### 📝 Documentation

* **angular:** add README and licenses ([c27381e](https://github.com/GioPat/gp-grid/commit/c27381e6b1d86b093ac9082136334370eddf30cd))

## [0.10.3](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.10.2...gp-grid-v0.10.3) (2026-04-06)


### 🐛 Bug Fixes

* enhance handling for mobile ([9d45952](https://github.com/GioPat/gp-grid/commit/9d45952db4be8601ef1d3595ae7bc39cdbdb7d6d))

## [0.10.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.10.1...gp-grid-v0.10.2) (2026-04-05)


### 🐛 Bug Fixes

* manage self not defined when doing SSR ([a5dcb0e](https://github.com/GioPat/gp-grid/commit/a5dcb0e642724bdd0074f0f7285a4d117a7243ab))

## [0.10.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.10.0...gp-grid-v0.10.1) (2026-04-05)


### ♻️ Refactoring

* code enhancements ([9295d93](https://github.com/GioPat/gp-grid/commit/9295d9386e37e55e1a1f8b93161490ada1151a2c))

## [0.10.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.9.7...gp-grid-v0.10.0) (2026-04-05)


### ✨ Features

* enable column dragging, filtering and resizing for mobile ([7f02c2f](https://github.com/GioPat/gp-grid/commit/7f02c2fa185e288ded80eb8fc443bfbe81f02ccd))
* enable column dragging, filtering and resizing for mobile ([1fd6b30](https://github.com/GioPat/gp-grid/commit/1fd6b30ac35fc248d79e2fc01c6b2207fbd3cb0a))

## [0.9.7](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.9.6...gp-grid-v0.9.7) (2026-04-04)


### 📝 Documentation

* add sonarqube badges and remove support icons ([4da2030](https://github.com/GioPat/gp-grid/commit/4da2030292254ae6e979a90f2453771844dff9f1))

## [0.9.6](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.9.5...gp-grid-v0.9.6) (2026-04-04)


### 🐛 Bug Fixes

* no data available display position ([bfef9ba](https://github.com/GioPat/gp-grid/commit/bfef9ba1018a9843ddea0244b64f082631ab5526))


### ♻️ Refactoring

* fix last issues in the core ([597d463](https://github.com/GioPat/gp-grid/commit/597d46374b41d133b45299a998a67ae4ad59350c))

## [0.9.5](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.9.4...gp-grid-v0.9.5) (2026-04-04)


### 🐛 Bug Fixes

* handle Object rendering, allow to define valueFormatter ([76c3115](https://github.com/GioPat/gp-grid/commit/76c31159d1f96244cac86ef999ac37cd42442c19))


### ⚡Performance

* optimize low cardinality column distinct values ([9561b36](https://github.com/GioPat/gp-grid/commit/9561b366caa4a7f2280364137ace625e2d2f010e))


### ♻️ Refactoring

* code improvements ([0b700ba](https://github.com/GioPat/gp-grid/commit/0b700ba8f5e0351ef149483e9dc9ee4fe64f0111))
* reduce cognitive complexity of functions ([c238fdb](https://github.com/GioPat/gp-grid/commit/c238fdbceb8bce0cac83d2fbe6ed3b9b7e6299fb))
* reduce cyclomatic complexity of moveRow ([56abe2b](https://github.com/GioPat/gp-grid/commit/56abe2b51344a1cb529e7a198e4965c00d638b9f))

## [0.9.4](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.9.3...gp-grid-v0.9.4) (2026-03-21)


### 🐛 Bug Fixes

* testing settings ([f53a2f2](https://github.com/GioPat/gp-grid/commit/f53a2f20c1159ab7549a9eea3e3ce95c48053069))

## [0.9.3](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.9.2...gp-grid-v0.9.3) (2026-02-28)


### 🐛 Bug Fixes

* reduce z-indexes from 100 to 11 ([6b1a637](https://github.com/GioPat/gp-grid/commit/6b1a637ab61529fd620628cdcc4d4ee07c7bce71))

## [0.9.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.9.1...gp-grid-v0.9.2) (2026-02-26)


### 🐛 Bug Fixes

* reset scroll when filtering ([d7d6b4e](https://github.com/GioPat/gp-grid/commit/d7d6b4ee3e8338d62ad966799cf5d3e1b7820fe2))

## [0.9.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.9.0...gp-grid-v0.9.1) (2026-02-26)


### 🐛 Bug Fixes

* keyboard navigation ([508ea14](https://github.com/GioPat/gp-grid/commit/508ea14f125107a84b06edbc5410cca213f1ae23))

## [0.9.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.8.3...gp-grid-v0.9.0) (2026-02-22)


### ✨ Features

* add compatibility with React 18 ([1ed590d](https://github.com/GioPat/gp-grid/commit/1ed590db861ca66285863b4a290b00fef5eca850))
* add possibility to target renderer directly by callback ([675ebd6](https://github.com/GioPat/gp-grid/commit/675ebd6d2ab79bb136a1fe5bd4e5876aa360d7e6))
* **core:** improve batching instruction and export common logic ([6b3f0f8](https://github.com/GioPat/gp-grid/commit/6b3f0f87de55c17358bec78a0ecfe47cc2b845b0))
* **react:** add GpGrid alias ([fb91115](https://github.com/GioPat/gp-grid/commit/fb911152c00caaef33a328800b3095a4c7636938))


### 🐛 Bug Fixes

* move css properties in their respective classes ([a78b8eb](https://github.com/GioPat/gp-grid/commit/a78b8eb6e8a9632b17b638b36d51286a05c94786))
* order with shift keystroke ([caf49a8](https://github.com/GioPat/gp-grid/commit/caf49a8a36679b5be7c83d2e9bb386446636e412))


### ♻️ Refactoring

* split Header and Body components ([cae3851](https://github.com/GioPat/gp-grid/commit/cae38515563b0cf01e2d421e387816aeaabadd91))

## [0.8.3](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.8.2...gp-grid-v0.8.3) (2026-02-19)


### 🐛 Bug Fixes

* align react-dom version for peer-dependencies ([aebce94](https://github.com/GioPat/gp-grid/commit/aebce942f2fb681ac299ebc154884e88d0fe5636))

## [0.8.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.8.1...gp-grid-v0.8.2) (2026-02-14)


### 🐛 Bug Fixes

* filter popup ([50aa074](https://github.com/GioPat/gp-grid/commit/50aa0746375b06d316a7d0666a9e132035ef6fb3))

## [0.8.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.8.0...gp-grid-v0.8.1) (2026-02-14)


### 🐛 Bug Fixes

* header disappearing on firefox after 1.3M rows ([3c62ff3](https://github.com/GioPat/gp-grid/commit/3c62ff3fbdb3d7caaa423c0e1cd02274ad6c0195))

## [0.8.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.7.4...gp-grid-v0.8.0) (2026-02-14)


### ✨ Features

* add APIs for reactivity ([b0b11dd](https://github.com/GioPat/gp-grid/commit/b0b11dd6a371b64d390d8524c4eb4b33e2f0abbf))
* add loader when sorting the data also for Mutable datasource ([a393529](https://github.com/GioPat/gp-grid/commit/a393529acc5b6b8d90639298196c3ed6be24269d))
* change UI filter icon with funnel ([08f3b0a](https://github.com/GioPat/gp-grid/commit/08f3b0a3b79695ab4fea1da6846229fbd991f985))
* expose APIs for mutating data and add warning for big datasets ([03bc3ff](https://github.com/GioPat/gp-grid/commit/03bc3ff19d718b18fd3b7cd36d1cc89a3e9f4035))

## [0.7.4](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.7.3...gp-grid-v0.7.4) (2026-01-28)


### 🐛 Bug Fixes

* use organization for package names ([6817fce](https://github.com/GioPat/gp-grid/commit/6817fcef180ace81158a4528be6d1db0b450630f))

## [0.7.3](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.7.2...gp-grid-v0.7.3) (2026-01-17)


### 🐛 Bug Fixes

* make sure the grid is reactive to change of highlighting options ([28f7d00](https://github.com/GioPat/gp-grid/commit/28f7d002ddb9126c2456809b3481eb93afff31c3))

## [0.7.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.7.1...gp-grid-v0.7.2) (2026-01-17)


### 🐛 Bug Fixes

* skip computing width for the hidden columns ([0d82351](https://github.com/GioPat/gp-grid/commit/0d823511b1987b6754a36d31218b7aab9865fc5b))

## [0.7.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.7.0...gp-grid-v0.7.1) (2026-01-17)


### 🐛 Bug Fixes

* backcompatibity issue with rowData props ([72fa49a](https://github.com/GioPat/gp-grid/commit/72fa49a555ccfa52cdd5c9f8598b97a642b6bf0a))

## [0.7.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.6.0...gp-grid-v0.7.0) (2026-01-17)


### ✨ Features

* **core,react,vue:** add hidden property to column to avoid display ([ef61e75](https://github.com/GioPat/gp-grid/commit/ef61e75b20053fce6ec4c1f0c44e6f225a9203ca))
* **core,react,vue:** add highlighting properties to enable user custom highlighting classes ([6cb6736](https://github.com/GioPat/gp-grid/commit/6cb6736b11345c9d6718c4cb11bafd942364e4f5))
* **core:** add APIs to the GridCore to add/delete/update rows ([1cc5550](https://github.com/GioPat/gp-grid/commit/1cc55505b098f331caa57c58000e2fe3850cf598))


### ♻️ Refactoring

* rationalize common operations to increase code quality and fix tests ([58a052e](https://github.com/GioPat/gp-grid/commit/58a052e1d5f7edf446ab8eaabdf7fe3990097be3))

## [0.6.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.5.3...gp-grid-v0.6.0) (2026-01-11)


### ✨ Features

* **core:** add parallel sorting capability using web workers and k-way merge ([88a20c8](https://github.com/GioPat/gp-grid/commit/88a20c851c579a5b526435f36490e1f254db4cce))


### 🐛 Bug Fixes

* destroy previous datasource if new one is provided ([2d4e0b9](https://github.com/GioPat/gp-grid/commit/2d4e0b9f73285c7b6f8615db276ec991d9724a9e))
* reference to the core was not wired to the actual GridCore ([76c9483](https://github.com/GioPat/gp-grid/commit/76c94836cfe39d357303ae656643f22af31d3481))


### 📝 Documentation

* **core,react,vue:** update link in the READMEs with the new domain ([4f28882](https://github.com/GioPat/gp-grid/commit/4f2888206c0ef95086a9d36e6d8e11a8de36bba0))
* fix react README ([a5fe440](https://github.com/GioPat/gp-grid/commit/a5fe4409a719bb4c431c63c7ec7491ea0142a788))

## [0.5.3](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.5.2...gp-grid-v0.5.3) (2026-01-09)


### 📝 Documentation

* **react,vue:** change default logo ([d4e7ae4](https://github.com/GioPat/gp-grid/commit/d4e7ae401b25bbc744bac0071de83a5cdf932dd8))

## [0.5.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.5.1...gp-grid-v0.5.2) (2026-01-09)


### 📝 Documentation

* **react,vue:** add logo and update links to the documentation ([375efc8](https://github.com/GioPat/gp-grid/commit/375efc88c6005e8b8c9f66b25f6fc957b39f1220))

## [0.5.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.5.0...gp-grid-v0.5.1) (2026-01-09)


### 📝 Documentation

* add website to main README ([d04e498](https://github.com/GioPat/gp-grid/commit/d04e4981f7208aae245d30dd60d26ee0d6b0c118))

## [0.5.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.4.0...gp-grid-v0.5.0) (2026-01-09)


### ✨ Features

* **react,vue:** expose GridCore for programmatic Grid management ([4e2facb](https://github.com/GioPat/gp-grid/commit/4e2facbfc2bba3e40017407b9dc6e390000b35ff))


### 🐛 Bug Fixes

* manage memory deallocation when freeing data in the table ([d405506](https://github.com/GioPat/gp-grid/commit/d4055060beb66dd9afe36e08e6a42ff19d5c02f8))


### ♻️ Refactoring

* rationalize filtering for datasource and indexed-data-store ([160ca32](https://github.com/GioPat/gp-grid/commit/160ca32b9878d5db983df69e0f4699ccbe5c3e93))

## [0.4.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.3.0...gp-grid-v0.4.0) (2026-01-06)


### ✨ Features

* **core,react,vue:** add initialWidth and initialHeight for first rendering and add browser guards for SSR ([e45ff16](https://github.com/GioPat/gp-grid/commit/e45ff16e342bb0a9c23346bc5c51725724109115))

## [0.3.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.2.5...gp-grid-v0.3.0) (2026-01-03)


### ✨ Features

* **core,react,vue:** make sure the columns take the full div width proportionally ([b3325e3](https://github.com/GioPat/gp-grid/commit/b3325e3aa0eb2aed36c0f598d5a0771dc37902b3))


### 🐛 Bug Fixes

* z-index is now defaulted to 10 and can be changed by overriding CSS class ([bdaa1cb](https://github.com/GioPat/gp-grid/commit/bdaa1cb42c1194c5179c87ad6e7e366e1ba8242f))

## [0.2.5](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.2.4...gp-grid-v0.2.5) (2026-01-03)


### 🐛 Bug Fixes

* install only packages dependencies in CD pipeline ([95e552b](https://github.com/GioPat/gp-grid/commit/95e552b080b4e36dd1337ccbd6bfdb4ce4c00c67))

## [0.2.4](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.2.3...gp-grid-v0.2.4) (2026-01-03)


### 🐛 Bug Fixes

* use pnpm to publish ([71edf8b](https://github.com/GioPat/gp-grid/commit/71edf8bedab3bce79f5c9a1e8ff5c7559d891b7b))

## [0.2.3](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.2.2...gp-grid-v0.2.3) (2026-01-03)


### 🐛 Bug Fixes

* **core,vue:** update typing error and add shim for *.vue ([3f656b3](https://github.com/GioPat/gp-grid/commit/3f656b302be55b188a3e964d04402e39d8c31008))


### 📝 Documentation

* **core:** Update official package list ([c936b92](https://github.com/GioPat/gp-grid/commit/c936b9248827b7eec54b49449703415001981deb))

## [0.2.2](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.2.1...gp-grid-v0.2.2) (2026-01-03)


### 🐛 Bug Fixes

* **vue:** command build:production does not need dts flag ([5c4c0ca](https://github.com/GioPat/gp-grid/commit/5c4c0ca3c5e609cb83daf5fa349ea067deb12d03))

## [0.2.1](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.2.0...gp-grid-v0.2.1) (2026-01-03)


### 📝 Documentation

* Update main README and add Vue lib README ([0d44fa1](https://github.com/GioPat/gp-grid/commit/0d44fa1ba2bf73b7fc7b8068ae3636612e474812))

## [0.2.0](https://github.com/GioPat/gp-grid/compare/gp-grid-v0.1.6...gp-grid-v0.2.0) (2026-01-03)


### ✨ Features

* Enable advanced filter capabilities ([a4c4e68](https://github.com/GioPat/gp-grid/commit/a4c4e6889adebac7982bba78fa400f5ee3bba3d8))
