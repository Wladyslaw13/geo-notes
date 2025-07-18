<template>
	<div class="app-container">
		<div class="header">
			<div class="header-content">
				<h1 class="logo">Geo-Notes</h1>
				<div class="controls">
					<button @click="startAddNote" class="btn-add" :disabled="addingNote">
						<span class="icon">+</span>
						<span class="text">Добавить</span>
					</button>
					<select v-model="selectedCategory" class="select-input">
						<option value="">Все категории</option>
						<option
							v-for="category in categories"
							:key="category"
							:value="category"
						>
							{{ category }}
						</option>
					</select>
					<input v-model="dateFilter" type="date" class="date-input" />
					<div class="notes-counter">{{ filteredNotes.length }} заметок</div>
				</div>
			</div>
			<div v-if="addingNote" class="hint">
				🎯 Кликните на карте для выбора позиции заметки
			</div>
		</div>

		<div class="main-content">
			<div class="map-container">
				<div id="map" class="map"></div>
			</div>

			<div
				class="sidebar"
				:class="{ 'sidebar-expanded': showForm || showNotesList }"
			>
				<div v-if="showForm" class="form-container">
					<div class="form-header">
						<h3>{{ editingNote ? 'Редактировать' : 'Новая заметка' }}</h3>
						<button @click="closeForm" class="btn-close">×</button>
					</div>

					<form @submit.prevent="handleSubmit" class="form">
						<input
							v-model="formData.title"
							type="text"
							placeholder="Заголовок *"
							required
							class="input"
						/>

						<input
							v-model="formData.category"
							type="text"
							placeholder="Категория *"
							required
							class="input"
						/>

						<textarea
							v-model="formData.description"
							placeholder="Описание (необязательно)"
							rows="3"
							class="input textarea"
						></textarea>

						<div class="coords-display">
							<span
								>📍 {{ formData.lat?.toFixed(4) }},
								{{ formData.lng?.toFixed(4) }}</span
							>
						</div>

						<div class="form-actions">
							<button type="submit" class="btn-save">
								{{ editingNote ? 'Сохранить' : 'Добавить' }}
							</button>
							<button type="button" @click="closeForm" class="btn-cancel">
								Отмена
							</button>
						</div>
					</form>
				</div>

				<div v-else-if="showNotesList" class="notes-container">
					<div class="notes-header">
						<h3>Заметки</h3>
						<button @click="showNotesList = false" class="btn-close">×</button>
					</div>

					<div class="notes-list">
						<div v-if="filteredNotes.length === 0" class="empty-state">
							📍 Заметок не найдено
						</div>
						<div v-else class="notes">
							<div
								v-for="note in filteredNotes"
								:key="note.id"
								class="note-card"
								@click="viewNoteOnMap(note)"
							>
								<div class="note-title">{{ note.title }}</div>
								<div class="note-meta">
									<span class="note-category">{{ note.category }}</span>
									<span class="note-date">{{
										formatDate(note.createdAt)
									}}</span>
								</div>
								<div class="note-actions" @click.stop>
									<button @click="editNote(note)" class="btn-edit">✏️</button>
									<button @click="deleteNote(note.id)" class="btn-delete">
										🗑️
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="floating-buttons">
				<button
					v-if="!showNotesList && !showForm"
					@click="showNotesList = true"
					class="fab fab-list"
					:title="`Показать заметки (${filteredNotes.length})`"
				>
					📋
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useNoteStore, type Note } from '../stores/noteStore'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
	iconRetinaUrl:
		'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
	iconUrl:
		'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
	shadowUrl:
		'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const noteStore = useNoteStore()

const map = ref<L.Map | null>(null)
const showForm = ref(false)
const showNotesList = ref(false)
const addingNote = ref(false)
const editingNote = ref<Note | null>(null)
const selectedCategory = ref('')
const dateFilter = ref('')
const markers = ref<{ [key: string]: L.Marker }>({})

const formData = ref({
	title: '',
	description: '',
	category: '',
	lat: 55.7558,
	lng: 37.6176,
})

function migrateAndCleanData() {
	const notes = noteStore.notes
	const validNotes = notes.filter(note => {
		const lat = Number(note.lat)
		const lng = Number(note.lng)
		return (
			note.id &&
			note.title &&
			note.category &&
			typeof note.lat === 'number' &&
			typeof note.lng === 'number' &&
			!isNaN(lat) &&
			!isNaN(lng) &&
			lat >= -90 &&
			lat <= 90 &&
			lng >= -180 &&
			lng <= 180
		)
	})

	if (validNotes.length !== notes.length) {
		console.log(
			`Очищено ${notes.length - validNotes.length} поврежденных заметок`
		)
		localStorage.setItem('geo-notes', JSON.stringify(validNotes))
		noteStore.notes.splice(0, noteStore.notes.length, ...validNotes)
	}
}

const categories = computed(() => {
	const cats = new Set(noteStore.notes.map(note => note.category))
	return Array.from(cats).filter(cat => cat)
})

const filteredNotes = computed(() => {
	let filtered = noteStore.notes.filter(note => {
		const lat = Number(note.lat)
		const lng = Number(note.lng)
		return (
			note.id &&
			note.title &&
			note.category &&
			!isNaN(lat) &&
			!isNaN(lng) &&
			lat >= -90 &&
			lat <= 90 &&
			lng >= -180 &&
			lng <= 180
		)
	})

	if (selectedCategory.value) {
		filtered = filtered.filter(note => note.category === selectedCategory.value)
	}

	if (dateFilter.value) {
		filtered = filtered.filter(note =>
			note.createdAt.startsWith(dateFilter.value)
		)
	}

	return filtered
})

onMounted(() => {
	migrateAndCleanData()
	nextTick(() => {
		initMap()
	})
})

onUnmounted(() => {
	Object.values(markers.value).forEach(marker => {
		try {
			if (map.value && map.value.hasLayer(marker)) {
				marker.closePopup()
				map.value.removeLayer(marker)
			}
		} catch (error) {
			console.warn('Error cleaning marker on unmount:', error)
		}
	})
	markers.value = {}

	if (map.value) {
		try {
			map.value.remove()
			map.value = null
		} catch (error) {
			console.warn('Error cleaning map on unmount:', error)
		}
	}
})

watch(
	filteredNotes,
	() => {
		if (map.value) {
			updateMarkers()
		}
	},
	{ deep: true }
)

function initMap() {
	const mapContainer = document.getElementById('map')
	if (!mapContainer) return

	try {
		map.value = L.map('map', {
			zoomControl: false,
		}).setView([55.7558, 37.6176], 10)

		L.control.zoom({ position: 'topright' }).addTo(map.value as L.Map)

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors',
		}).addTo(map.value as L.Map)

		map.value.on('click', onMapClick)

		updateMarkers()
	} catch (error) {
		console.error('Error initializing map:', error)
	}
}

function onMapClick(e: L.LeafletMouseEvent) {
	if (!addingNote.value) return

	const lat = Number(e.latlng.lat.toFixed(6))
	const lng = Number(e.latlng.lng.toFixed(6))

	formData.value.lat = lat
	formData.value.lng = lng
	editingNote.value = null
	showForm.value = true
	showNotesList.value = false
	addingNote.value = false

	if (map.value) {
		map.value.getContainer().style.cursor = ''
	}
}

function startAddNote() {
	if (addingNote.value) return

	addingNote.value = true
	editingNote.value = null
	showForm.value = false
	showNotesList.value = false
	resetFormData()

	if (map.value) {
		map.value.getContainer().style.cursor = 'crosshair'
	}
}

function resetFormData() {
	formData.value = {
		title: '',
		description: '',
		category: '',
		lat: 55.7558,
		lng: 37.6176,
	}
}

function updateMarkers() {
	if (!map.value) return

	const newMarkers: { [key: string]: L.Marker } = {}

	const currentNoteIds = new Set(filteredNotes.value.map(note => note.id))

	Object.entries(markers.value).forEach(([noteId, marker]) => {
		if (!currentNoteIds.has(noteId)) {
			try {
				if (map.value && map.value.hasLayer(marker)) {
					marker.closePopup()
					map.value.removeLayer(marker)
				}
			} catch (error) {
				console.warn('Error removing marker:', error)
			}
		} else {
			newMarkers[noteId] = marker
		}
	})

	filteredNotes.value.forEach(note => {
		if (newMarkers[note.id]) {
			return
		}

		try {
			const lat = Number(note.lat)
			const lng = Number(note.lng)

			if (
				isNaN(lat) ||
				isNaN(lng) ||
				lat < -90 ||
				lat > 90 ||
				lng < -180 ||
				lng > 180
			) {
				console.warn(
					'Skipping note with invalid coordinates:',
					note.id,
					lat,
					lng
				)
				return
			}

			const marker = L.marker([lat, lng], {
				draggable: true,
				riseOnHover: true,
			})

			if (map.value) {
				marker.addTo(map.value as L.Map)
			}

			const popupContent = `
        <div style="padding: 8px; min-width: 200px;">
          <h3 style="margin: 0 0 4px 0; font-weight: 600; font-size: 14px;">${
						note.title
					}</h3>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${
						note.category
					}</p>
          ${
						note.description
							? `<p style="margin: 0 0 8px 0; font-size: 12px;">${note.description}</p>`
							: ''
					}
          <div style="display: flex; gap: 8px;">
            <button onclick="window.editNoteFromPopup('${note.id}')" 
                    style="background: #007aff; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">
              Редактировать
            </button>
            <button onclick="window.deleteNoteFromPopup('${note.id}')" 
                    style="background: #ff3b30; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">
              Удалить
            </button>
          </div>
        </div>
      `

			marker.bindPopup(popupContent)

			marker.on('dragend', () => {
				try {
					const pos = marker.getLatLng()
					const newLat = Number(pos.lat.toFixed(6))
					const newLng = Number(pos.lng.toFixed(6))
					noteStore.updateNote(note.id, { lat: newLat, lng: newLng })
				} catch (error) {
					console.error('Error updating marker position:', error)
				}
			})

			newMarkers[note.id] = marker
		} catch (error) {
			console.error('Error creating marker for note:', note.id, error)
		}
	})

	markers.value = newMarkers
}

function handleSubmit() {
	if (!formData.value.title.trim() || !formData.value.category.trim()) {
		alert('Заполните обязательные поля')
		return
	}

	const lat = Number(formData.value.lat)
	const lng = Number(formData.value.lng)

	if (
		isNaN(lat) ||
		isNaN(lng) ||
		lat < -90 ||
		lat > 90 ||
		lng < -180 ||
		lng > 180
	) {
		alert('Некорректные координаты. Выберите позицию на карте.')
		return
	}

	const data = {
		title: formData.value.title.trim(),
		description: formData.value.description.trim() || undefined,
		category: formData.value.category.trim(),
		lat: Number(lat.toFixed(6)),
		lng: Number(lng.toFixed(6)),
	}

	if (editingNote.value) {
		noteStore.updateNote(editingNote.value.id, data)
	} else {
		noteStore.addNote(data)
	}

	closeForm()
}

function closeForm() {
	showForm.value = false
	editingNote.value = null
	addingNote.value = false
	resetFormData()

	if (map.value) {
		map.value.getContainer().style.cursor = ''
	}
}

function editNote(note: Note) {
	editingNote.value = note
	formData.value = {
		title: note.title,
		description: note.description || '',
		category: note.category,
		lat: note.lat,
		lng: note.lng,
	}
	showForm.value = true
	showNotesList.value = false
	addingNote.value = false
}

function deleteNote(id: string) {
	if (confirm('Удалить заметку?')) {
		noteStore.deleteNote(id)
	}
}

function viewNoteOnMap(note: Note) {
	if (map.value) {
		map.value.setView([note.lat, note.lng], 15)
		const marker = markers.value[note.id]
		if (marker) {
			marker.openPopup()
		}
	}
	showNotesList.value = false
}

function editNoteFromPopup(id: string) {
	const note = noteStore.notes.find(n => n.id === id)
	if (note) {
		editNote(note)
	}
}

function deleteNoteFromPopup(id: string) {
	deleteNote(id)
}

function formatDate(dateString: string) {
	return new Date(dateString).toLocaleDateString('ru-RU', {
		day: '2-digit',
		month: '2-digit',
	})
}

// Глобальные функции для popup
;(window as any).editNoteFromPopup = editNoteFromPopup
;(window as any).deleteNoteFromPopup = deleteNoteFromPopup
</script>

<style scoped>
* {
	box-sizing: border-box;
}

.app-container {
	height: 100vh;
	width: 100%;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	background: #f5f5f5;
}

.header {
	background: #fff;
	border-bottom: 1px solid #e0e0e0;
	padding: 12px 16px;
	flex-shrink: 0;
	z-index: 1000;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-content {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
}

.logo {
	font-size: 18px;
	font-weight: 700;
	color: #333;
	margin: 0;
	flex-shrink: 0;
}

.controls {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.btn-add {
	background: linear-gradient(135deg, #007aff, #0056cc);
	color: #fff;
	border: none;
	border-radius: 8px;
	padding: 8px 12px;
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
	display: flex;
	align-items: center;
	gap: 4px;
	box-shadow: 0 2px 4px rgba(0, 122, 255, 0.3);
}

.btn-add:hover:not(:disabled) {
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(0, 122, 255, 0.4);
}

.btn-add:disabled {
	opacity: 0.6;
	cursor: not-allowed;
	background: #ccc;
}

.btn-add .icon {
	font-size: 16px;
	font-weight: bold;
}

.select-input,
.date-input {
	border: 1px solid #ddd;
	border-radius: 6px;
	padding: 6px 10px;
	font-size: 13px;
	background: #fff;
	transition: border-color 0.2s ease;
}

.select-input:focus,
.date-input:focus {
	outline: none;
	border-color: #007aff;
}

.notes-counter {
	font-size: 12px;
	color: #666;
	background: #f0f0f0;
	padding: 4px 8px;
	border-radius: 4px;
	white-space: nowrap;
}

.hint {
	font-size: 13px;
	color: #007aff;
	text-align: center;
	margin-top: 8px;
	padding: 6px 12px;
	background: #f0f8ff;
	border-radius: 6px;
	border: 1px solid #e0f2ff;
}

.main-content {
	flex: 1;
	position: relative;
	overflow: hidden;
}

.map-container {
	width: 100%;
	height: 100%;
	position: relative;
}

.map {
	width: 100%;
	height: 100%;
}

.sidebar {
	position: absolute;
	top: 16px;
	right: 16px;
	width: 320px;
	max-height: calc(100% - 80px);
	background: #fff;
	border-radius: 12px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
	z-index: 1001;
	transform: translateX(100%);
	opacity: 0;
	transition: all 0.3s ease;
	overflow: hidden;
}

.sidebar-expanded {
	transform: translateX(0);
	opacity: 1;
}

.form-container {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.form-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px;
	border-bottom: 1px solid #f0f0f0;
	background: #fafafa;
}

.form-header h3 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: #333;
}

.btn-close {
	background: none;
	border: none;
	font-size: 20px;
	color: #999;
	cursor: pointer;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.2s ease;
	z-index: 1;
	position: relative;
}

.btn-close:hover {
	background: #f0f0f0;
	color: #666;
}

.form {
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 12px;
	flex: 1;
	overflow-y: auto;
}

.input {
	border: 1px solid #ddd;
	border-radius: 8px;
	padding: 10px 12px;
	font-size: 14px;
	background: #fff;
	transition: border-color 0.2s ease;
	font-family: inherit;
}

.input:focus {
	outline: none;
	border-color: #007aff;
	box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.textarea {
	resize: none;
	min-height: 60px;
}

.coords-display {
	font-size: 12px;
	color: #666;
	padding: 8px 12px;
	background: #f8f8f8;
	border-radius: 6px;
	text-align: center;
}

.form-actions {
	display: flex;
	gap: 8px;
	padding-top: 8px;
}

.btn-save,
.btn-cancel {
	flex: 1;
	padding: 10px;
	border: none;
	border-radius: 8px;
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
}

.btn-save {
	background: #007aff;
	color: #fff;
}

.btn-save:hover {
	background: #0056cc;
}

.btn-cancel {
	background: #f0f0f0;
	color: #666;
}

.btn-cancel:hover {
	background: #e0e0e0;
}

.notes-container {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.notes-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px;
	border-bottom: 1px solid #f0f0f0;
	background: #fafafa;
}

.notes-header h3 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: #333;
}

.notes-list {
	flex: 1;
	overflow-y: auto;
	padding: 8px;
}

.empty-state {
	padding: 40px 20px;
	text-align: center;
	color: #999;
	font-size: 14px;
}

.notes {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.note-card {
	background: #fff;
	border: 1px solid #f0f0f0;
	border-radius: 8px;
	padding: 12px;
	cursor: pointer;
	transition: all 0.2s ease;
	position: relative;
}

.note-card:hover {
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	border-color: #e0e0e0;
}

.note-title {
	font-weight: 600;
	color: #333;
	font-size: 14px;
	margin-bottom: 4px;
	line-height: 1.3;
}

.note-meta {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}

.note-category {
	font-size: 12px;
	color: #007aff;
	background: #f0f8ff;
	padding: 2px 6px;
	border-radius: 4px;
}

.note-date {
	font-size: 11px;
	color: #999;
}

.note-actions {
	display: flex;
	gap: 8px;
	position: absolute;
	top: 8px;
	right: 8px;
	opacity: 0;
	transition: opacity 0.2s ease;
}

.note-card:hover .note-actions {
	opacity: 1;
}

.btn-edit,
.btn-delete {
	background: none;
	border: none;
	font-size: 14px;
	cursor: pointer;
	padding: 4px;
	border-radius: 4px;
	transition: background 0.2s ease;
}

.btn-edit:hover {
	background: #f0f8ff;
}

.btn-delete:hover {
	background: #fff0f0;
}

.floating-buttons {
	position: absolute;
	bottom: 20px;
	right: 20px;
	display: flex;
	flex-direction: column;
	gap: 12px;
	z-index: 400;
}

.fab {
	width: 56px;
	height: 56px;
	border-radius: 50%;
	border: none;
	font-size: 20px;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.3s ease;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.fab-list {
	background: #fff;
	color: #333;
}

.fab-list:hover {
	transform: translateY(-2px);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

@media (max-width: 768px) {
	.header {
		padding: 10px 12px;
	}

	.header-content {
		flex-direction: column;
		gap: 10px;
	}

	.controls {
		width: 100%;
		justify-content: space-between;
		gap: 8px;
	}

	.btn-add .text {
		display: none;
	}

	.select-input,
	.date-input {
		font-size: 12px;
		padding: 5px 8px;
	}

	.sidebar {
		top: 10px;
		right: 10px;
		left: 10px;
		width: auto;
		max-height: calc(100% - 40px);
	}

	.floating-buttons {
		bottom: 80px;
		right: 16px;
	}

	.fab {
		width: 48px;
		height: 48px;
		font-size: 18px;
	}
}

@media (max-width: 480px) {
	.header {
		padding: 8px 10px;
	}

	.logo {
		font-size: 16px;
	}

	.controls {
		gap: 6px;
	}

	.notes-counter {
		display: none;
	}

	.form {
		padding: 12px;
	}

	.notes-list {
		padding: 6px;
	}

	.floating-buttons {
		bottom: 60px;
		right: 12px;
	}

	.fab {
		width: 44px;
		height: 44px;
		font-size: 16px;
	}
}

/* Стили для Leaflet контролов */
:global(.leaflet-control-zoom) {
	border: none !important;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
}

:global(.leaflet-control-zoom a) {
	background: #fff !important;
	border: none !important;
	color: #333 !important;
	font-weight: bold !important;
}

:global(.leaflet-control-zoom a:hover) {
	background: #f5f5f5 !important;
}
</style>
