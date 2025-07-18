import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { computed } from 'vue'

export interface Note {
	id: string
	lat: number
	lng: number
	title: string
	description?: string
	category: string
	createdAt: string
}

export const useNoteStore = defineStore('note', () => {
	const notes = useLocalStorage<Note[]>('geo-notes', [])

	const addNote = (note: Omit<Note, 'id' | 'createdAt'>) => {
		const newNote: Note = {
			...note,
			id: uuidv4(),
			createdAt: new Date().toISOString(),
		}
		notes.value.push(newNote)
	}

	const updateNote = (id: string, updatedNote: Partial<Note>) => {
		const index = notes.value.findIndex(n => n.id === id)
		if (index !== -1) {
			notes.value[index] = { ...notes.value[index], ...updatedNote }
		}
	}

	const deleteNote = (id: string) => {
		notes.value = notes.value.filter(n => n.id !== id)
	}

	const getNotesByCategory = (category: string) => {
		return computed(() => notes.value.filter(n => n.category === category))
	}

	const getNotesByDate = (date: string) => {
		return computed(() => notes.value.filter(n => n.createdAt.startsWith(date)))
	}

	return {
		notes,
		addNote,
		updateNote,
		deleteNote,
		getNotesByCategory,
		getNotesByDate,
	}
})
