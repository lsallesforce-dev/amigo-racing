    const categoryItems = sortableItems.filter(item => item.categoryId === categoryId);
    const otherItems = sortableItems.filter(item => item.categoryId !== categoryId);

    // Embaralhar items da categoria
    const shuffled = [...categoryItems].sort(() => Math.random() - 0.5);

    const config = currentConfigs[categoryId];

    // Recalcular números e horários
    const recalculated = shuffled.map((item, idx) => ({
      ...item,
      orderPosition: idx + 1,
      numberStart: config.numberStart + idx,
      numberEnd: config.numberStart + idx,
      startTime: calculateStartTime(config.startTime, idx, config.intervalSeconds),
    }));

    const newItems = [...otherItems, ...recalculated].sort(
      (a, b) => a.categoryId - b.categoryId
    );

    setSortableItems(newItems);

    // Atualizar agrupamento
    const grouped: Record<number, SortableItem[]> = {};
    newItems.forEach(item => {
      if (!grouped[item.categoryId]) {
        grouped[item.categoryId] = [];
      }
      grouped[item.categoryId].push(item);
    });
    setGroupedByCategory(grouped);
    
    // SALVAR IMEDIATAMENTE no banco usando onConfirm
    onConfirm(newItems);
  };

  const handleConfirm = () => {
    onConfirm(sortableItems);
  };

  return (