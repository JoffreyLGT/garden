---
categories:
  - "[[Softwares]]"
maker: ""
url: https://git.kernel.org/pub/scm/git/git.git
rating: "7"
created: 2026-05-11
tags:
  - 0🌲
public: true
---
Tooling on Windows: [[Git bash]]

## Utilisation des `worktree`

Les `worktree` permettent d'avoir plusieurs copies d'un même repo sur votre machine, gérées par Git et placées chacune dans un dossier qui leur est propre.
Ainsi, il est possible d'avoir un `worktree` **features** une branche **features/maFeature** et un `worktree` **codereview** sur une branche **features/featureToReview**.
L'intérêt des `worktree` est de ne pas avoir à *stash* ou à *commit* des changements lorsqu'on a besoin de changer de branche.
### Commandes utiles
#### Lister les `worktree`

```bash
git worktree list
```

#### Ajouter un `worktree`

La commande de base permettant de créer un nouveau `worktree`. Celui-ci sera sur une branche du même nom.
```shell
git worktree add <name>
```

Pour forcer le checkout d'une branche spécifique, on utilise l'argument `-f <branche-name>`.
```shell
git worktree add <name> -f <branch-name>
# Example: create a worktree called feature that checks out the dev branch
git worktree add feature -f dev
```

#### Supprimer un `worktree`

```shell
git worktree remove <name>
```

## Nettoyage du repos

### BFG Repo-Cleaner
Outil permettant de supprimer ou remplacer le contenu de fichiers qui ne devraient pas avoir été commit.

## Références
- [Conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) : spécifications pour la rédaction de message de commit lisibles pour les humains et pour les machines.
- https://learngitbranching.js.org/ : learn Git branching interactively
