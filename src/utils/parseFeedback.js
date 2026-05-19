export function parseFeedback(raw) {
  return {
    score_global: Number(raw.score_global) || 0,
    resume: raw.resume || '',
    points_forts: Array.isArray(raw.points_forts) ? raw.points_forts : [],
    axes_amelioration: Array.isArray(raw.axes_amelioration) ? raw.axes_amelioration : [],
    competences: Array.isArray(raw.competences)
      ? raw.competences.map((c) => ({
          nom: c.nom || '',
          score: Number(c.score) || 0,
          commentaire: c.commentaire || '',
        }))
      : [],
    conseil_principal: raw.conseil_principal || '',
  };
}
