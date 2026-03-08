                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="navigatorState">Estado</Label>
                                    <Select
                                      value={formData.navigatorState || ""}
                                      onValueChange={(value) => {
                                        if (value) {
                                          setFormData({ ...formData, navigatorState: value });
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="notranslate" translate="no">
                                        <SelectValue placeholder="UF" />
                                      </SelectTrigger>
                                      <SelectContent className="notranslate" translate="no">
                                        {BRAZILIAN_STATES.map((state) => (
                                          <SelectItem key={state} value={state} className="notranslate" translate="no">
                                            {state}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="space-y-2">
                                        <Label htmlFor="navigatorBirthDate">Data de Nascimento</Label>
                                        <Input
                                          id="navigatorBirthDate"
                                          type="date"
                                          value={formData.navigatorBirthDate}