/**
 * CBA (Confederação Brasileira de Automobilismo) Scoring Rules
 * Points assigned to positions 1 through 15.
 */

export const CBA_POINTS_TABLE: Record<number, number> = {
    1: 17,
    2: 15,
    3: 14,
    4: 13,
    5: 12,
    6: 11,
    7: 10,
    8: 9,
    9: 8,
    10: 7,
    11: 6,
    12: 5,
    13: 4,
    14: 3,
    15: 2,
};

/**
 * Pure function to calculate points according to CBA rules based on position.
 * Disqualified or non-finishing pilots score 0.
 *
 * @param position - The finish position of the competitor
 * @param isDisqualified - True if the competitor was disqualified or did not finish properly
 * @returns The amount of points earned per CBA rules.
 */
export const calculateCbaPoints = (position: number, isDisqualified: boolean = false): number => {
    if (isDisqualified) {
        return 0;
    }

    // Se a posição estiver na tabela (1 a 15), retorna a pontuação de lá. Se não, retorna 0.
    return CBA_POINTS_TABLE[position] || 0;
};
