            <div className="text-center py-8 text-muted-foreground">
              Nenhuma subcategoria disponível para este evento.
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-4">
            {categoriesToDisplay.map(category => (
              <div key={category.id} className="space-y-2">
                  <Label htmlFor={`order-${category.id}`}>
                    {category.parent?.name ? `${category.parent.name} - ${category.name}` : category.name}
                  </Label>
                  <select
                    id={`order-${category.id}`}
                    value={order[String(category.id)] || 1}
                  onChange={(e) => handleOrderChange(category.id, parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {Array.from({ length: categoriesToDisplay.length }, (_, i) => i + 1).map(pos => (
                    <option key={pos} value={pos}>
                      {pos}º lugar
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>