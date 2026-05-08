import { afterEach } from 'vitest'
import { clearRecipeCache } from '../src/learning/recipes'

afterEach(() => {
  clearRecipeCache()
})
