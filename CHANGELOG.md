# Changelog

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
