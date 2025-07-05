export const markerListDefaultTemplates = {
  style: `
      .flex-table {
        display: flex;
        flex-direction: column;
      }
      .flex-row {
        display: flex;
        flex-direction: row;
        cursor: pointer;
        border-bottom: 1px solid black;
      }
      .flex-row.bordered {
        border-left: 1px solid black;
        border-right: 1px solid black;
      }
      .active.flex-row {
        background-color: rgba(0, 0, 0, 0.2);
      }
      .flex-cell {
        height: 60px;
        line-height: 60px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        -webkit-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      .header-cell {
        overflow: hidden;
        text-overflow: ellipsis;
      }`,
  row: `
        <div class="flex-row bordered">
            <div class="flex-cell"><span slot="color" style="display:inline-block;height:60px;min-width:10px"></span></div>
            <div class="flex-cell" style="min-width: 120px"><img slot="thumbnail" height="60"></div>
            <div class="flex-cell" style="flex-grow:1" slot="name"></div>
            <div class="flex-cell" style="min-width:120px" slot="start"></div>
            <div class="flex-cell" style="min-width:120px" slot="end"></div>
            <div class="flex-cell" style="min-width:120px" slot="duration"></div>
            <div class="flex-cell" style="min-width:60px">
                <span slot="action-edit">✎</span>
                <span slot="remove">🗑</span>
            </div>
        </div>
        `,
  header: `
          <div class="flex-row" slot="header">
            <div class="header-cell" style="width:130px"></div>
            <div class="header-cell" style="flex-grow:1">Name</div>
            <div class="header-cell" style="width:120px">In</div>
            <div class="header-cell" style="width:120px">Out</div>
            <div class="header-cell" style="width:120px">Duration</div>
            <div class="header-cell" style="width:60px"></div>
          </div>
        `,
  empty: `No markers defined`,
  loading: 'Loading...',
};
